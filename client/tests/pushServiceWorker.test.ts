import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { memoryIndexedDB } from './memoryIndexedDB';

const request = <T>(result: T) => {
  const req: { result: T; onsuccess?: () => void; onerror?: () => void } = { result };
  queueMicrotask(() => req.onsuccess?.());
  return req;
};

/** A fake IndexedDB holding `state`; `closed` counts closed connections. */
const fakeIndexedDB = (state: unknown) => {
  const db = { closed: 0, opened: 0 };
  return Object.assign(db, {
    open: () => {
      db.opened += 1;
      return request({
        transaction: () => ({ objectStore: () => ({ get: () => request(state) }) }),
        createObjectStore: () => {},
        close: () => {
          db.closed += 1;
        },
      });
    },
  });
};

/** Runs public/push-sw.js with a fake service worker scope and IndexedDB holding `state`. */
function loadServiceWorker(state: unknown, indexedDB: unknown = fakeIndexedDB(state)) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const showNotification = vi.fn(async () => {});
  const self = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      handlers[type] = handler;
    },
    registration: { showNotification },
    location: { origin: 'https://weather.example' },
    clients: { matchAll: vi.fn(async () => []), openWindow: vi.fn(async () => null) },
  };
  const source = readFileSync(new URL('../public/push-sw.js', import.meta.url), 'utf8');
  new Function('self', 'indexedDB', source)(self, indexedDB);
  return { handlers, showNotification, clients: self.clients };
}

async function push(sw: ReturnType<typeof loadServiceWorker>, payload: unknown) {
  let done: Promise<unknown> = Promise.resolve();
  sw.handlers.push!({ data: { text: () => JSON.stringify(payload) }, waitUntil: (p: Promise<unknown>) => (done = p) });
  await done;
}

const state = {
  language: 'ru',
  locale: 'ru',
  strings: {
    titles: { orange: { thunderstorm: 'Оранжевое предупреждение: Грозы' } },
    until: 'Действует до: {time}',
    fromTo: 'Начало: {start}, окончание: {end}',
  },
  places: [{ name: 'Краков', url: '/weather/50.06,19.94', areas: ['PL1261'], timeZone: 'Europe/Warsaw' }],
};

// FCM delivers a data message to a service worker without its SDK in this shape.
const message = {
  from: '/topics/PL1261.storm.orange',
  data: {
    key: 'W1',
    level: 'orange',
    type: 'thunderstorm',
    onset: '2000-01-01T00:00:00Z',
    expires: '2099-01-01T00:00:00Z',
    areas: '["PL1261"]',
    texts:
      '{"pl-PL":{"event":"Burze","headline":"Burze z gradem"},"en-GB":{"event":"Thunderstorms","headline":"Thunderstorms with hail"}}',
  },
};

describe('push service worker', () => {
  it("writes the notification in the user's language, for their place, tagged by the warning", async () => {
    const sw = loadServiceWorker(state);
    await push(sw, message);
    const [title, options] = sw.showNotification.mock.calls[0] as unknown as [
      string,
      NotificationOptions & { renotify: boolean },
    ];
    expect(title).toBe('Оранжевое предупреждение: Грозы · Краков');
    // No Russian text from the issuer: English, as on the page.
    expect(options.body).toMatch(/^Действует до: .+\nThunderstorms with hail$/);
    expect(options).toMatchObject({ tag: 'alert-W1', renotify: false, data: { url: '/weather/50.06,19.94' } });
  });

  it('still shows something without saved state (every push must show a notification)', async () => {
    const sw = loadServiceWorker(null);
    await push(sw, message);
    expect(sw.showNotification).toHaveBeenCalledWith('Thunderstorms', expect.objectContaining({ tag: 'alert-W1' }));
  });

  // Each case would otherwise end with no notification at all.
  it.each([
    ['a place stored without areas (an older format)', loadServiceWorker({ ...state, places: [{ name: 'Краков' }] })],
    ['strings stored without a field', loadServiceWorker({ ...state, strings: { titles: {} } })],
    ['an invalid stored locale', loadServiceWorker({ ...state, locale: 'not a locale!' })],
  ])('shows one notification from the message alone despite %s, and logs why', async (_, sw) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    await push(sw, message);
    expect(sw.showNotification).toHaveBeenCalledTimes(1);
    // The issuer's English text: the fake worker has no navigator.language.
    expect(sw.showNotification).toHaveBeenCalledWith(
      'Thunderstorms',
      expect.objectContaining({ body: 'Thunderstorms with hail', tag: 'alert-W1', renotify: false }),
    );
    expect(logged).toHaveBeenCalledWith('push: full notification failed', expect.any(Error));
    logged.mockRestore();
  });

  // Unreadable IndexedDB is the same as no saved state, not a failure.
  it.each([
    [
      'IndexedDB throws on open',
      loadServiceWorker(null, {
        open: () => {
          throw new Error('SecurityError');
        },
      }),
    ],
    [
      'IndexedDB throws inside its callback',
      loadServiceWorker(null, {
        open: () =>
          request({
            transaction: () => {
              throw new Error('InvalidStateError');
            },
            close: () => {},
          }),
      }),
    ],
  ])('shows the notification without saved state when %s', async (_, sw) => {
    await push(sw, message);
    expect(sw.showNotification).toHaveBeenCalledTimes(1);
    expect(sw.showNotification).toHaveBeenCalledWith('Thunderstorms', expect.objectContaining({ tag: 'alert-W1' }));
  });

  it.each([
    ['a message that is not even an object', null],
    ['malformed issuer texts', { ...message, data: { ...message.data, texts: 'null', areas: 'null' } }],
  ])('shows "Weather warning" for %s', async (_, payload) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sw = loadServiceWorker(state);
    await push(sw, payload);
    expect(sw.showNotification).toHaveBeenCalledTimes(1);
    expect(sw.showNotification).toHaveBeenCalledWith('Weather warning', expect.any(Object));
    logged.mockRestore();
  });
});

describe('notification click', () => {
  function click(sw: ReturnType<typeof loadServiceWorker>) {
    let done: Promise<unknown> = Promise.resolve();
    const close = vi.fn();
    sw.handlers.notificationclick!({
      notification: { close, data: { url: '/weather/50.06,19.94' } },
      waitUntil: (p: Promise<unknown>) => (done = p),
    });
    return done;
  }
  const URL_ = 'https://weather.example/weather/50.06,19.94';

  /** An open window of the app; `answers`: its page runs useOpenFromNotification. */
  function openWindow({ answers, navigate }: { answers: boolean; navigate?: () => Promise<unknown> }) {
    const messages: unknown[] = [];
    return {
      messages,
      focus: vi.fn(async () => Promise.reject(new Error('no user activation'))),
      navigate: vi.fn(navigate ?? (async () => ({}))),
      postMessage: vi.fn((message: unknown, ports: MessagePort[]) => {
        messages.push(message);
        if (answers) ports[0]!.postMessage('opened');
      }),
    };
  }

  it('asks the open page to show the place itself, without navigating it', async () => {
    const sw = loadServiceWorker(state);
    const window = openWindow({ answers: true });
    sw.clients.matchAll.mockResolvedValueOnce([window] as never);
    await click(sw);
    expect(window.focus).toHaveBeenCalled();
    expect(window.messages).toEqual([{ type: 'open-place', path: '/weather/50.06,19.94' }]);
    expect(window.navigate).not.toHaveBeenCalled();
    expect(sw.clients.openWindow).not.toHaveBeenCalled();
  });

  // An iPhone resumed the app on the page it showed before: the reason for asking the page.
  it('navigates the window itself when its page does not answer', async () => {
    vi.useFakeTimers();
    try {
      const sw = loadServiceWorker(state);
      const window = openWindow({ answers: false });
      sw.clients.matchAll.mockResolvedValueOnce([window] as never);
      const done = click(sw);
      await vi.advanceTimersByTimeAsync(1000);
      await done;
      expect(window.navigate).toHaveBeenCalledWith(URL_);
      expect(sw.clients.openWindow).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens a new window when none is open, or the open one cannot be navigated', async () => {
    const sw = loadServiceWorker(state);
    await click(sw); // no window open
    expect(sw.clients.openWindow).toHaveBeenCalledWith(URL_);

    // Neither answering nor navigable (no postMessage: an old page, a window not this worker's).
    const stuck = {
      focus: vi.fn(async () => ({})),
      navigate: vi.fn(async () => {
        throw new TypeError('not controlled');
      }),
    };
    sw.clients.matchAll.mockResolvedValueOnce([stuck] as never);
    await click(sw);
    expect(stuck.navigate).toHaveBeenCalled();
    expect(sw.clients.openWindow).toHaveBeenCalledTimes(2);
  });

  // Safari left focus() pending: the click never ended, nothing opened, no more pushes came.
  it('ends the click even when focusing or navigating never settles', async () => {
    vi.useFakeTimers();
    try {
      const sw = loadServiceWorker(state);
      const never = () => new Promise(() => {});
      const window = {
        focus: vi.fn(never),
        navigate: vi.fn(never),
        postMessage: vi.fn(),
      };
      sw.clients.matchAll.mockResolvedValueOnce([window] as never);
      let ended = false;
      void click(sw).then(() => (ended = true));
      await vi.advanceTimersByTimeAsync(1000); // the page did not answer
      expect(window.navigate).toHaveBeenCalledWith(URL_); // not held up by focus()
      await vi.advanceTimersByTimeAsync(3000);
      expect(ended).toBe(true);
      // A navigation still pending may yet happen: no second window over it.
      expect(sw.clients.openWindow).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // An iPhone brought a running app forward without the message or navigate() reaching it:
  // the page picks the place up from storage when it shows (useOpenFromNotification).
  it('records the place for the page', async () => {
    const db = memoryIndexedDB();
    const sw = loadServiceWorker(null, db);
    sw.clients.matchAll.mockResolvedValueOnce([] as never);
    const before = Date.now();
    await click(sw);
    expect(db.data.get('open')).toEqual({ path: '/weather/50.06,19.94', at: expect.any(Number) });
    expect((db.data.get('open') as { at: number }).at).toBeGreaterThanOrEqual(before);
    expect(sw.clients.openWindow).toHaveBeenCalledWith(URL_);
  });

  // Browsers allow openWindow() and focus() only shortly after the click: a slow IndexedDB must
  // not use that time up. (Found by roborev.)
  it('opens the window at once, not after recording the place', async () => {
    vi.useFakeTimers();
    try {
      const stuck = { open: () => ({}) }; // never answers
      const sw = loadServiceWorker(null, stuck);
      sw.clients.matchAll.mockResolvedValueOnce([] as never);
      void click(sw);
      await vi.advanceTimersByTimeAsync(0);
      expect(sw.clients.openWindow).toHaveBeenCalledWith(URL_);
    } finally {
      vi.useRealTimers();
    }
  });

  // A record still there after the page opened the place would open it again on a later return.
  // (Found by roborev.)
  it('removes the record once the page has opened the place', async () => {
    const db = memoryIndexedDB();
    const sw = loadServiceWorker(null, db);
    const window = openWindow({ answers: true });
    sw.clients.matchAll.mockResolvedValueOnce([window] as never);
    await click(sw);
    expect(window.messages).toHaveLength(1);
    expect(db.data.has('open')).toBe(false);
  });

  it('closes its database connection after reading, so the database can be upgraded later', async () => {
    const db = fakeIndexedDB(null);
    const sw = loadServiceWorker(null, db);
    await push(sw, { key: 'a', level: 'orange', type: 'wind', areas: '[]', texts: '{}' });
    expect(db.opened).toBeGreaterThan(0);
    expect(db.closed).toBe(db.opened);
  });
});
