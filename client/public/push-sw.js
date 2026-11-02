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

self.addEventListener('push', (event) => {
  const payload = event.data ? parse(event.data.text(), {}) : {};
  // Every push must show a notification (Chrome shows its own otherwise, Safari unsubscribes).
  event.waitUntil(
    showWarning(payload).catch((error) => {
      // Visible in the worker's console; the error carries no personal data.
      console.error('push: full notification failed', error);
      return showFallback(payload);
    }),
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

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin);
  // A window of the app already open is reused: focused (started at once, while the click still
  // counts as the user's, but never waited on alone), and asked to open the place itself.
  // WindowClient.navigate() alone was not enough: on an iPhone the app resumed from the
  // background on the page it showed before (2026-11-02: Rhodes stayed open after tapping a
  // warning for Warsaw). It remains the fallback for a page that does not answer, and a new
  // window the last one. Every step has a time limit, so the event always ends.
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(async (windows) => {
      const open = windows[0];
      if (!open) return within(self.clients.openWindow(url.href), STEP_MS, {});
      // Side by side: the place is opened whatever focus() does; the event ends when both have.
      const focused = within(open.focus?.(), STEP_MS, {});
      const opened = (async () => {
        if (await askPageToOpen(open, url.pathname + url.search)) return undefined;
        if ('navigate' in open) {
          // Pending past the limit: it may still happen, so no second window over it.
          const navigated = await within(
            Promise.resolve().then(() => open.navigate(url.href)),
            STEP_MS,
            { onTimeout: 'pending', onReject: null },
          );
          if (navigated) return undefined;
        }
        // Not this worker's window (opened before it, or after a hard reload), or no navigate().
        return within(self.clients.openWindow(url.href), STEP_MS, {});
      })();
      return Promise.all([focused, opened]);
    }),
  );
});
