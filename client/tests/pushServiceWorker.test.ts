import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

/** Runs public/push-sw.js with a fake service worker scope and IndexedDB holding `state`. */
function loadServiceWorker(state: unknown) {
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
  const request = <T,>(result: T) => {
    const req: { result: T; onsuccess?: () => void; onerror?: () => void } = { result };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  };
  const indexedDB = {
    open: () =>
      request({
        transaction: () => ({ objectStore: () => ({ get: () => request(state) }) }),
        createObjectStore: () => {},
      }),
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
    texts: '{"pl-PL":{"event":"Burze","headline":"Burze z gradem"},"en-GB":{"event":"Thunderstorms","headline":"Thunderstorms with hail"}}',
  },
};

describe('push service worker', () => {
  it("writes the notification in the user's language, for their place, tagged by the warning", async () => {
    const sw = loadServiceWorker(state);
    await push(sw, message);
    const [title, options] = sw.showNotification.mock.calls[0] as unknown as [string, NotificationOptions & { renotify: boolean }];
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

  it('opens the place in a window of the app, or a new one', async () => {
    const sw = loadServiceWorker(state);
    const focus = vi.fn(async () => ({}));
    const navigate = vi.fn(async () => ({ focus }));
    sw.clients.matchAll.mockResolvedValueOnce([{ navigate }] as never);
    await click(sw);
    expect(navigate).toHaveBeenCalledWith(URL_);
    expect(focus).toHaveBeenCalled();

    await click(sw); // no window open
    expect(sw.clients.openWindow).toHaveBeenCalledWith(URL_);
  });

  it('does not open a second window when only focusing fails after navigating', async () => {
    const sw = loadServiceWorker(state);
    const navigate = vi.fn(async () => ({ focus: async () => Promise.reject(new Error('no user activation')) }));
    sw.clients.matchAll.mockResolvedValueOnce([{ navigate }] as never);
    await click(sw);
    expect(navigate).toHaveBeenCalled();
    expect(sw.clients.openWindow).not.toHaveBeenCalled();
  });

  it('opens a new window when the open one cannot be navigated', async () => {
    const sw = loadServiceWorker(state);
    const navigate = vi.fn(async () => {
      throw new TypeError('not controlled');
    });
    sw.clients.matchAll.mockResolvedValueOnce([{ navigate }] as never);
    await click(sw);
    expect(sw.clients.openWindow).toHaveBeenCalledWith(URL_);
  });
});
