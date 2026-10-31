# 0009. Installable app that shows the last forecast offline

- Status: Accepted
- Date: 2026-10-31 (recorded)

## Context

A weather app is opened on the go, with a weak signal or none. Free Render takes up to a minute to wake up. Stale
weather shown without warning is misleading ("now" and "today" may be out of date).

## Decision

- `vite-plugin-pwa` with Workbox `generateSW`: the app shell is precached; forecasts, air quality and places by id are
  NetworkFirst with a 6-second network timeout; only 200 responses are stored, at most 50 for a day; responses marked
  `no-store` are not stored. Search, location and warnings are not cached.
- A response served from the cache is marked (`X-From-Cache`); the client tracks values that came from it, and the
  "You're offline, showing the last loaded forecast" notice is shown exactly while such data is on screen.
- New versions install in the background (`skipWaiting`, `clientsClaim`) and run from the next page load; no
  "Reload" prompt.
- iOS gets an install hint on the home page, since it never offers installation itself.
- The API cache name includes the API version; caches of other versions are deleted.

## Consequences

- A returning user sees the last forecast after 6 seconds while Render wakes; a new user still waits.
- The service worker exists only in production builds; check it with `npm run build && npm run preview -w client`.
- A page opened before a deploy may fail to load the lazily loaded Firebase chunk until reloaded.

## Alternatives considered

- `navigator.onLine` alone for the notice: missed Wi-Fi without internet.
- One flag for "the last response was cached": a fresh response hid an old forecast still on screen.
- An "updated at …" label on every forecast, an update prompt: more UI and translations for little gain.
