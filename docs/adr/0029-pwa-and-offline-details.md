# 0029. PWA details: saved copies on server errors, a banner tied to what is on screen, silent updates

- Status: Accepted
- Date: 2026-11-02

## Context

[ADR 0009](0009-offline-pwa.md) chose an installable app that shows the last forecast offline. This record holds the
smaller choices that followed; `docs/architecture.md` ("Installable app (PWA)") describes only how the parts work.

## Decision

- **No service worker in development:** it would cache the dev server's modules and confuse hot reload.
- **Icons from one SVG, rendered at build time:** no binaries in the repository. Maskable and Apple icons are padded
  with the app's blue so the operating system's crop never cuts the picture.
- **NetworkFirst for forecast, air quality and place names:** online, the network always answers, so the API's
  `Cache-Control` and the in-memory caches decide freshness as without a service worker. The saved copy is only a
  fallback.
- **A 6-second network timeout:** without it, a stalled request on a weak signal hung for tens of seconds before the
  copy showed. 6 seconds is above a normal slow-3G answer, so a working network still wins. The same
  timeout covers a backend that is slow or restarting: returning users see their last forecast with the banner after 6
  seconds instead of a skeleton; new users wait as before.
- **A server error counts as a failed network when a saved copy exists:** with the API down, the site's proxy answers
  502/504 itself, and NetworkFirst passed that to the page as an answer, so returning users got an error instead of
  their last forecast, which is exactly the case the copy is for. A 4xx is the real answer (an unknown place, a rate
  limit) and is never replaced.
- **A 5xx without the API's error body reads as `NETWORK_ERROR`, not `INTERNAL`:** `INTERNAL` offers no "Try again".
  A failed batch then falls back to one request per city, so each city's own saved copy can answer.
- **`SERVER_UNAVAILABLE` for a proxy 502/504 without a copy:** it was `NETWORK_ERROR`, which told users to check an
  internet connection that worked.
- **Only `200` answers are stored:** errors are never cached, the same rule as on the server.
- **Search and location are not cached:** search is useless offline, and the approximate place depends on who asks
  (`private, no-store`).
- **Fonts from the site, precached with the shell:** the app works offline and sends nothing to Google Fonts.
- **The stale-data banner follows the data on screen:** a saved forecast's "Now" and "Today" may be hours old, and the
  saved copy is also used while the browser still reports a network (Wi-Fi without internet such as a hotel login
  page, a weak signal). So the banner shows when `navigator.onLine` is false or a value from the cache is on screen.
  The value itself carries where it came from (a `WeakSet` filled at parse time), so the mark survives caches, state
  and props; components report it while mounted. The banner lasts exactly as long as old data is shown: a fresh
  air-quality answer does not hide an old forecast, and an old forecast no longer shown does not keep it up. The
  in-memory caches drop saved values so the next view asks the network again. The status region is always in the page
  so screen readers announce the change.
- **Silent updates with `skipWaiting` and `clientsClaim`, set by hand:** with `injectRegister: 'script-defer'` the
  plugin does not add them, and without them a new worker waited until every tab was closed; an installed app that
  stays open, or a tab that is only reloaded, kept the old code and the API version it calls indefinitely (found while
  moving the API to `/api/v1`).
- **Privacy policy opened with a full page load:** its lazily loaded chunk may be gone after a deploy; a full load
  always brings the current build. The Firebase chunk keeps the same risk; the panel shows its
  usual error and a reload fixes it.
- **An install hint on iOS only:** Chrome, Edge and Android offer installation themselves; iOS never does, so users
  would not know the app can go on the Home Screen. Every iOS browser can add to the Home Screen from Share since iOS
  16.4, so the hint shows in all of them.
  - The card names the Share icon instead of pointing at it: where Safari puts the Share button depends on the iOS
    version and the tab bar layout (bottom, top, or inside "…"), so an arrow could point at nothing.
  - Only on the start page: city pages are usually opened from a link, for the weather.
  - Translations carry `{icon}` because word order differs between languages.
- **Manifest in English only:** one manifest per language would need a server-side choice, and it only affects the
  name under the icon.
- **Nothing extra for saved cities offline:** the start-page cards use the same forecast request as a city page, so
  they are cached the same way.

- **The banner says which failed, the network or our server** (added 2026-11-02, found while checking the
  API-down case live): a copy used for a 5xx is marked `X-From-Cache: server`, and the banner then reads "The weather
  server isn't responding…" instead of "You're offline…", which told users with a working connection to check it.
  The reason travels with each saved value, so a page showing both kinds says offline: the user's network is the
  likelier cause, and the advice it implies still helps.

## Consequences

- Returning users see their last forecast, marked as possibly out of date, when the network, the proxy or the API
  fails or stalls; new users still wait.
- The banner depends on every hook that puts API data on screen reporting saved values; a new such hook must do the
  same.
- A page opened before a deploy runs old code until reloaded, and may fail to load lazy chunks.
- The service worker can only be checked in a production build.
- Installed apps show "Weather" under the icon in every language.

## Alternatives considered

- **Telling the two cases apart on the page** (a request to `/api/health` when a copy shows up): one more request
  at the worst moment, and racy; the service worker already knows why it used the copy.
- **One neutral text for both** ("Showing the last loaded forecast…" without a cause): true in both cases but tells
  the offline user nothing to do, the common case on phones.
- **Banner from `navigator.onLine` only** (first version): no warning on Wi-Fi without internet.
- **One global flag set by the last response** (second version): a parallel fresh answer hid an old forecast.
- **Tracking cached URLs** (third version): the warning outlived old data no longer shown; a known trade-off, replaced
  by tying the banner to what is on screen.
- **A per-forecast "updated at" stamp:** a second state in every view.
- **A "New version — reload" prompt:** nothing in the page is lost by waiting, and it is another UI state to translate
  into every language.
- **An own install button for Chrome and Android (`beforeinstallprompt`):** duplicates the browser's own offer and is
  not available in Safari or Firefox.
- **An arrow pointing at Safari's Share button:** its position varies, see above.
- **One manifest per language:** needs a server-side choice for a small gain.
