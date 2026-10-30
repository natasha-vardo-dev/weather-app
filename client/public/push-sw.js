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

function readState() {
  return new Promise((resolve) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      const get = open.result.transaction(STORE).objectStore(STORE).get('state');
      get.onsuccess = () => resolve(get.result ?? null);
      get.onerror = () => resolve(null);
    };
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

self.addEventListener('push', (event) => {
  const payload = event.data ? parse(event.data.text(), {}) : {};
  // Every push must show a notification (Chrome shows its own otherwise, Safari unsubscribes).
  event.waitUntil(showWarning(payload));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href;
  // Reuse a window of the app this worker controls: navigate() rejects for one it doesn't
  // (opened before the worker, or after a hard reload), and then a new one opens. A failed
  // focus() after a navigation that worked is ignored: the page is already there, and
  // opening another window would show it twice.
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((windows) => {
      const open = windows.find((w) => 'navigate' in w);
      if (!open) return self.clients.openWindow(url);
      return open.navigate(url).then(
        (w) => (w ?? open).focus().catch(() => {}),
        () => self.clients.openWindow(url),
      );
    }),
  );
});
