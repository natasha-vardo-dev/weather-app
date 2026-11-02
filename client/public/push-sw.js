/*
 * Push notifications about official weather warnings, loaded into the generated service
 * worker (workbox importScripts in vite.config.ts). Plain JS: it runs as is, unbundled.
 *
 * Messages are FCM data messages: level, type, times, the warning's areas and the issuer's
 * texts. The page stores (IndexedDB) the places the user turned warnings on for, and the
 * strings in the user's language, so the notification is written here, in that language.
 * A notification's tag is the warning's first version: an update replaces it quietly.
 */
const DB = 'weather-push';
const STORE = 'kv';

/**
 * Never rejects nor hangs: an exception inside a callback would leave the promise unsettled.
 * Closes its connection when done: the worker lives on between pushes, and an open connection
 * would block a later version of the database.
 */
function readState() {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        const db = open.result;
        db.onversionchange = () => db.close();
        // Settled first: nothing after it can leave the promise hanging.
        const done = (value) => {
          resolve(value);
          db.close();
        };
        try {
          const get = db.transaction(STORE).objectStore(STORE).get('state');
          get.onsuccess = () => done(get.result ?? null);
          get.onerror = () => done(null);
        } catch {
          done(null);
        }
      };
    } catch {
      resolve(null);
    }
  });
}

/**
 * Records the place a tapped notification opens (`open` in the same store), for the page to
 * pick up when it shows (useOpenFromNotification): on an iPhone a running app was neither
 * navigated nor reached by a message, and openWindow() only brought it forward on the page it
 * showed. Never rejects nor hangs; true once stored.
 */
function recordOpen(path) {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => resolve(false);
      open.onsuccess = () => {
        const db = open.result;
        db.onversionchange = () => db.close();
        const done = (stored) => {
          resolve(stored);
          db.close();
        };
        try {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put({ path, at: Date.now() }, 'open');
          tx.oncomplete = () => done(true);
          tx.onerror = () => done(false);
          tx.onabort = () => done(false);
        } catch {
          done(false);
        }
      };
    } catch {
      resolve(false);
    }
  });
}

/** Removes the record of the place to open once it is not needed. Never rejects nor hangs. */
function forgetOpen() {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => resolve();
      open.onsuccess = () => {
        const db = open.result;
        db.onversionchange = () => db.close();
        const done = () => {
          resolve();
          db.close();
        };
        try {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete('open');
          tx.oncomplete = done;
          tx.onerror = done;
          tx.onabort = done;
        } catch {
          done();
        }
      };
    } catch {
      resolve();
    }
  });
}

/**
 * TEMPORARY, for the iPhone case (2026-11-02: tapping a warning left a running app on another
 * city): the last 30 notification events of the last 7 days, kept on the device under `trace`
 * in the same store, written by this worker and the page (client/src/push/pendingOpen.ts). Read
 * from the page's console; never sent anywhere. Remove both with the investigation, and delete
 * the `trace` key once then (see tracePage), or entries stay on devices. Never rejects nor hangs.
 */
function trace(message, detail) {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => resolve();
      open.onsuccess = () => {
        const db = open.result;
        db.onversionchange = () => db.close();
        const done = () => {
          resolve();
          db.close();
        };
        try {
          const tx = db.transaction(STORE, 'readwrite');
          const store = tx.objectStore(STORE);
          const get = store.get('trace');
          // Done once the write is queued: close() lets the transaction finish first.
          get.onsuccess = () => {
            try {
              const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
              const entries = (Array.isArray(get.result) ? get.result : []).filter(
                (entry) => typeof entry?.at === 'number' && entry.at >= week,
              );
              entries.push({ at: Date.now(), who: 'worker', message, detail: detail ?? null });
              store.put(entries.slice(-30), 'trace');
            } catch {
              // A trace is never worth a failure.
            }
            done();
          };
          get.onerror = done;
          tx.oncomplete = done;
          tx.onerror = done;
          tx.onabort = done;
        } catch {
          done();
        }
      };
    } catch {
      resolve();
    }
  });
}

function parse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function formatTime(iso, locale, timeZone) {
  const instant = Date.parse(iso);
  if (!Number.isFinite(instant)) return '';
  try {
    return new Intl.DateTimeFormat(locale, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone }).format(
      instant,
    );
  } catch {
    return new Intl.DateTimeFormat(locale, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(instant);
  }
}

/** The issuer's text in the user's language, else English, else the first. */
function pickText(texts, language) {
  const entries = Object.entries(texts);
  const base = (tag) => tag.toLowerCase().split('-')[0];
  const found =
    entries.find(([tag]) => base(tag) === language) ?? entries.find(([tag]) => base(tag) === 'en') ?? entries[0];
  return found ? found[1] : {};
}

async function showWarning(payload) {
  const data = payload.data ?? payload;
  const state = (await readState()) ?? { places: [], strings: null, language: 'en', locale: 'en' };
  const { strings, language, locale } = state;

  // The area this message was sent for (topic "AREA.group.level"), and the user's places in it.
  const topicArea = typeof payload.from === 'string' ? payload.from.replace(/^\/topics\//, '').split('.')[0] : null;
  const areas = new Set([...parse(data.areas, []), ...(topicArea ? [topicArea] : [])]);
  const places = (state.places ?? []).filter((place) => place.areas.some((area) => areas.has(area)));
  const place = places[0];

  const text = pickText(parse(data.texts, {}), language);
  const heading = strings?.titles?.[data.level]?.[data.type] ?? text.event ?? 'Weather warning';
  const title = place ? `${heading} · ${place.name}` : heading;
  const timeZone = place?.timeZone;
  const active = Date.parse(data.onset) <= Date.now();
  const when = strings
    ? active
      ? strings.until.replace('{time}', formatTime(data.expires, locale, timeZone))
      : strings.fromTo
          .replace('{start}', formatTime(data.onset, locale, timeZone))
          .replace('{end}', formatTime(data.expires, locale, timeZone))
    : '';

  await self.registration.showNotification(title, {
    body: [when, text.headline].filter(Boolean).join('\n'),
    tag: `alert-${data.key}`,
    // An update of a warning already shown replaces it without sound or a new banner.
    renotify: false,
    icon: '/pwa-192x192.png',
    badge: '/pwa-64x64.png',
    lang: language,
    data: { url: place?.url ?? '/' },
  });
}

/**
 * A plain notification when writing the full one failed: the stored state is of an older
 * format, IndexedDB is unavailable, the locale is invalid. It uses only the message: the
 * issuer's event and headline in the browser's language, else "Weather warning". Same tag,
 * so an update still replaces it quietly.
 */
function showFallback(payload) {
  const data = (payload && typeof payload === 'object' && (payload.data ?? payload)) || {};
  let text = {};
  try {
    const language = String(self.navigator?.language ?? 'en')
      .toLowerCase()
      .split('-')[0];
    text = pickText(parse(data.texts, {}), language) ?? {};
  } catch {
    // Malformed texts: the plain title.
  }
  const key = data.key;
  return self.registration.showNotification(
    typeof text.event === 'string' && text.event ? text.event : 'Weather warning',
    {
      ...(typeof text.headline === 'string' && text.headline ? { body: text.headline } : {}),
      ...(typeof key === 'string' ? { tag: `alert-${key}`, renotify: false } : {}),
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url: '/' },
    },
  );
}

/** How long one step of a click (focusing, navigating, opening a window) may take. */
const STEP_MS = 3000;

/**
 * The value of `promise`, or `onTimeout` if it neither resolves nor rejects within `ms` (a
 * rejection gives `onReject`). Safari can leave focus() pending: awaited without a limit, the
 * click never finished, nothing opened, and the worker received no more pushes. (2026-11-02)
 */
function within(promise, ms, { onTimeout, onReject }) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(onTimeout), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(onReject);
      },
    );
  });
}

self.addEventListener('push', (event) => {
  const payload = event.data ? parse(event.data.text(), {}) : {};
  // Every push must show a notification (Chrome shows its own otherwise, Safari unsubscribes).
  event.waitUntil(
    Promise.all([
      showWarning(payload).catch((error) => {
        // Visible in the worker's console; the error carries no personal data.
        console.error('push: full notification failed', error);
        return showFallback(payload);
      }),
      within(trace('push'), STEP_MS, {}),
    ]),
  );
});

/** How long an open page has to confirm it went to the place itself. */
const PAGE_ANSWER_MS = 1000;

/**
 * Asks a window of the app to open `path` itself, with its router (no reload); true once the
 * page confirmed (useOpenFromNotification). False without an answer in time: a page of an older
 * version, or one the browser has not resumed.
 */
function askPageToOpen(client, path) {
  return new Promise((resolve) => {
    try {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(false), PAGE_ANSWER_MS);
      channel.port1.onmessage = () => {
        clearTimeout(timer);
        resolve(true);
      };
      client.postMessage({ type: 'open-place', path }, [channel.port2]);
    } catch {
      resolve(false);
    }
  });
}

/** How long the click waits for the place to be recorded, and only before messaging the page. */
const RECORD_MS = 500;

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin);
  const path = url.pathname + url.search;
  // The place is recorded for the page to pick up when it shows (useOpenFromNotification): an
  // iPhone brought a running app forward without any route below reaching it (2026-11-02:
  // Rhodes stayed open after tapping a warning for Warsaw). Recorded alongside, never before:
  // browsers allow focus() and openWindow() only shortly after the click (Firefox about a
  // second), so they start at once. (Found by roborev.)
  // A window of the app already open is reused: focused, and asked to open the place itself;
  // WindowClient.navigate() is the fallback for a page that does not answer, a new window the
  // last one. Every step has a time limit, so the event always ends. Each route taken is
  // logged (Safari's Web Inspector shows the worker's console): a phone cannot be watched otherwise.
  // Each step goes to the console and, for now, to the on-device trace (awaited at the end).
  const traced = [];
  const log = (message, detail) => {
    console.info(message, detail ?? '');
    traced.push(trace(message, detail));
  };
  const record = recordOpen(path);
  // After the record's transaction: the trace must not delay it.
  log('notification click', path);
  const recording = within(record, RECORD_MS, { onTimeout: false });
  event.waitUntil(
    within(self.clients.matchAll({ type: 'window' }), STEP_MS, { onTimeout: [], onReject: [] })
      .then((windows) => {
        const open = windows[0];
        log('notification click: windows', windows.length);
        if (!open) {
          log('notification click: new window');
          return Promise.all([recording, within(self.clients.openWindow(url.href), STEP_MS, {})]);
        }
        // Side by side: the place is opened whatever focus() does; the event ends when all have.
        const focused = within(open.focus?.(), STEP_MS, {});
        const opened = (async () => {
          // A page that picks the record up as it shows must find it already there.
          await recording;
          if (await askPageToOpen(open, path)) {
            log('notification click: the page opened it');
            // Opened: a record written after the page cleared it would open the place again later.
            return within(
              record.then(() => forgetOpen()),
              STEP_MS,
              {},
            );
          }
          if ('navigate' in open) {
            log('notification click: no answer, navigating the window');
            // Pending past the limit: it may still happen, so no second window over it.
            const navigated = await within(
              Promise.resolve().then(() => open.navigate(url.href)),
              STEP_MS,
              { onTimeout: 'pending', onReject: null },
            );
            if (navigated) return undefined;
          }
          // Not this worker's window (opened before it, or after a hard reload), or no navigate().
          log('notification click: could not navigate, new window');
          return within(self.clients.openWindow(url.href), STEP_MS, {});
        })();
        return Promise.all([focused, opened]);
      })
      // The trace written, whatever the routes did.
      .then(() => within(Promise.all(traced), STEP_MS, {})),
  );
});
