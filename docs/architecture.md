# Architecture

## Overview

Client–server application using the Backend for Frontend (BFF) pattern.
The browser talks only to our backend; the backend talks to the weather provider.

## Backend layers

- `routes/` validate input (Zod) and map HTTP to service calls
- `services/` hold the logic: caching, key normalisation
- `providers/` adapt a specific external API to our `WeatherProvider` interface

Dependencies point downward only. Tests replace the provider with a fake.

## Why a backend at all

- Keeps API keys (if a paid provider is used) out of the browser
- Caches responses: forecasts for 10 minutes, air quality for 30 minutes, city searches for 24 hours
- Normalises provider data into our own model
- Lets us switch providers by adding a new adapter

## Caching

Forecast cache keys round coordinates to 2 decimals (~1 km), so nearby requests share an entry.
Every forecast also includes yesterday (Open-Meteo `past_days=1`), so it is not a request parameter and not part of the key: still one provider call per place.
Every forecast also includes the next 24 hours (`forecast_hours=24`, starting at the current hour), again with no extra provider call. Because of the 10-minute cache, right after the hour changes the first "Now" slot may still be the previous hour for a few minutes; accepted to keep provider usage flat.
The UI uses yesterday for one line under the current weather ("3° warmer than yesterday", comparing daily highs) rather than a row in the forecast list, which stays forward-looking.
Air quality comes from a separate Open-Meteo API (another host), so it has its own endpoint (`/api/air-quality`) and cache: 30 minutes, because the provider updates it hourly, with the same ~1 km key rounding. It is separate from `/forecast` so that the forecast never fails or waits because of it; the client loads both in parallel and simply hides the air quality item if that request fails. A failed request is retried once by itself after 20 seconds (most provider hiccups are short; without it the item stayed hidden until the city was reopened), and the page's "Try again" retries both requests. One retry, not a backoff loop: it is secondary data, and every retry spends the provider's rate limit. Considered and not done: an "Air quality: unavailable" line with its own retry button, which tells a failure apart from "no data for this place", at the price of one more UI state and 19 translations. The cost is one more provider call per place, at most 48 a day with this TTL (forecast: up to 144).
Which index to show is a presentation choice made in `shared` (`summarizeAirQuality`): the European AQI for places whose timezone is in `Europe/` or in a short list of European zones outside it (Canary Islands, Madeira, Azores, Iceland, Faroe Islands, Cyprus), the US AQI elsewhere, falling back to the other one when a value is missing. The API returns both raw values, so another client can choose differently.
The item shows a coloured dot (each index's official palette, darkest bands lightened for the blue background; the level is always written out, so colour is not the only signal). The whole value is a button (`aria-expanded`) that reveals PM2.5, PM10, O₃ and NO₂ concentrations below the details; they come in the same provider call. Without any pollutant data the value is plain text, so it never opens an empty box. Pollutants are shown as plain µg/m³ numbers without colour, because the two indices use different thresholds.
The cache is in-memory with a TTL and a size limit. With several instances, replace it with Redis.

## Frontend

SPA with client-side routing (React Router):

- `/` — start page
- `/weather/:lat,:lon?name=&country=` — forecast for a place
- anything else — not found

Pages live in `pages/`, reusable UI in `components/`.
Weather icons are a small hand-drawn set of filled two-colour SVGs (`WeatherIcon.tsx`). Icon libraries such as `lucide-react` were tried, but they are outline-only, and filling them breaks the rain, snow and storm icons; ten icons do not justify a dependency. `shared` only names the icon kind, so a React Native app can map the same kinds to its own images.
Because the browser doesn't treat SPA navigation as a new page, the app updates `document.title` itself and moves focus to the place heading for screen reader and keyboard users.
Data fetching lives in hooks (`useLocationSearch`, `useForecast`, `useAirQuality`). Forecasts and air quality go through a small shared in-memory cache (`api/queryCache.ts`, TTL equal to the API's `Cache-Control` max-age, 5 and 15 minutes): a place that is already loaded (for example by its favourite tile) renders at once, concurrent requests for one place are merged, and errors are not cached. Without it, switching cities briefly replaced the page with a loading line and the layout jumped. Unknown places show a placeholder shaped like the page, the air quality slot is kept while it loads, and `scrollbar-gutter: stable` keeps the content width fixed.

## Favourites

Saved cities live in the browser (`localStorage`, key `favorites:v1`), with no accounts and no server state. That keeps the backend stateless and avoids sign-in, a database and per-user data protection, at the cost of no sync between devices.

- **Model and rules in `shared`** (`favorites.ts`): a favourite is coordinates plus display name and country; places are matched by coordinates rounded to ~1 km, like place URLs, so a city is never saved twice. New ones go to the top; the list is capped at 10, and a full list blocks saving instead of silently dropping a city: the button becomes `aria-disabled` (still focusable, unlike `disabled`) with a visible hint about the limit linked via `aria-describedby`. `parseFavorites` validates what comes out of storage, because it is untrusted (edited by hand, an older format). A React Native app can reuse all of it with its own storage.
- **Client:** `useFavorites` reads storage through `useSyncExternalStore`. The storage work itself (reading, the subscription, the `save` / `remove` / `setHome` / `clearHome` actions) is plain functions in `favoritesStore.ts`, so its rules are unit-tested with a stubbed `localStorage`; the hook only connects them to React; the `storage` event keeps every open tab in sync. The city page has a toggle labelled "Save" or "Saved" (the star fills in; no `aria-pressed`, since the label already states it, and hidden text tells screen readers that pressing "Saved" removes the city); the start page shows saved cities as a grid of cards (name, country, icon, current temperature, condition, today's high/low; four columns on desktop, two on phones, fixed height so cards do not grow when weather arrives).
- **Quick switching:** on a city page, saved cities form a scrolling strip of compact tiles (city, country, icon, temperature) between the search and the weather, the same on every screen size. The open city stays in the strip, highlighted with `aria-current="page"`, so tiles never move when switching. The strip shows during loading and errors too. Each row makes the same forecast request as the city page, so they share the server and HTTP caches and opening a saved city is instant.
- **Cost:** one forecast request per saved city on the start page. A batch forecast endpoint would make it one request.
- **Home city:** one saved city can be the home city ("Set as home" next to "Save"; setting it saves the city first, and removing the city from favourites clears it). It is stored apart (`home-city:v1`), so the favourites format did not change; `resolveHomeCity` drops a stale value. It comes first in the strip and on the start-page cards, marked with a small house. Opening the app straight on the home city (`/` redirecting to it, with the cards moved to `/favourites`) was tried and dropped: it needed an extra "All favourites" link and made `/` mean different things to different people, while the start page already shows the home city first. Without a home city nothing changes for the user.
- **Considered and dropped: pinning.** A pin toggle (pinned cities first) was prototyped and removed. With at most 10 cities, all visible on the start page, it added a second concept and a second button next to "Save" without a real gain; the actual need, "my city first", is met by the home city instead (one clear concept), and later by geolocation.
- **Path to accounts:** keep the same hook API and swap its source for a server; on first sign-in, merge the local list into the account so nothing is lost. The server side would need a `favorite_locations` table, a session cookie, owner checks on every request (IDOR) and `Cache-Control: private, no-store` on personal responses.

## Languages

- **Default:** the first of `navigator.languages` the app supports (matched by base language, so `de-AT` picks German), otherwise English. An explicit choice in the switcher is saved in `localStorage` and wins next time.
- **Translations** live in `client/src/i18n/locales/`, one typed file per language (19 bundled, ~15 KB gzip in total). The `Messages` type makes a missing key a compile error. No i18n library: plurals use `Intl.PluralRules`, everything else is plain functions. With many more languages or translators working in a TMS, `i18next`/`FormatJS` with lazy-loaded JSON would be the next step.
- **No string translation for numbers and dates:** weekdays, clock time (12/24-hour by locale), percent and wind units come from `Intl`, so they are right for every locale, not only the translated ones.
- **The API stays language-neutral:** it returns condition keys (`partly-cloudy`) and error codes, and the client translates them. Only place search takes `lang`, because Open-Meteo returns city, region and country names in that language; `lang` is part of the search cache key.
- **One digit system per screen:** every number, including temperatures and the `{n}` in plurals, goes through `Intl.NumberFormat` for the user's full locale. Language files are functions of the formatters (`MessagesFactory`), because digits depend on the locale, not the language: `ar-EG` shows `١٤°`, plain `ar` shows `14°`. In right-to-left languages a temperature is wrapped in a bidi isolate (U+2066…U+2069): otherwise the degree sign drifts to the left of Arabic-Indic digits.
- **Right-to-left:** `<html dir>` is set for Arabic and Hebrew; CSS uses logical alignment (`text-align: end`), and each day's low, bar and high stay one left-to-right block, so the cold-to-warm bar matches its labels.
- **Place names follow the UI language:** names are stored (in favourites and in the `?name=` of a place URL) in the language they were searched in, so a city saved in English stayed "Warsaw" in a Russian UI. Places from search now carry the provider id (`?id=` in the URL, `id` in a favourite), and `useLocalizedPlace` fetches the names in the current language from `GET /api/locations/:id?lang=` (Open-Meteo `/v1/get`; cached for a day on the server and in the client). Favourites saved before ids existed fall back to a search by the stored name, keeping only a result at the same coordinates. The stored name is shown while loading or if the lookup fails. The id comes from the URL, so it is untrusted (an edited or stale link): a name is used only if the place found is at the same coordinates, and "Save" / "Set as home" keep the id only once it is confirmed (`withVerifiedId`), otherwise the city is saved without one and found by name search. The buttons stay enabled during the check: a click waits for it (it shares the page's request and has almost always finished), and clicks made meanwhile run in order ("Save" then "Set as home" both happen). `setHome` does nothing if the city could not be saved (the list filled up in another tab), so the home city is always a saved one. Provider ids are positive 32-bit integers (`isValidLocationId`): Open-Meteo rejects larger ones, so they are dropped by the server schema (400 without a provider call), by `parsePlace` and by `parseFavorites`. The hook's actions say what they do (`save`, `remove`, `setHome`, `clearHome`) instead of toggling: a save that waited for the check may find the city already saved (a click on a remounted button, another tab), and must not remove it then. Disabling the buttons until then was considered and rejected: they would flicker on every city opened, and a failed check must not block saving.

## Temperature units

- **Default from the region, then the user's choice:** `defaultTemperatureUnit` (shared) reads the region of the first system locale: Fahrenheit for the US, Bahamas, Belize, Cayman Islands, Palau, Liberia, Marshall Islands and Micronesia, Celsius elsewhere and when the locale has no region (`en`). The region, not the language: `en-GB` and `en-US` speak the same language but use different units. A switcher next to the language one overrides it; the choice is saved in `localStorage` (`temperature-unit`).
- **Custom list, not a native `<select>`:** on macOS a native select opens its menu over the field so that the selected option sits on it, so with °F chosen the list grew upwards. Both header switches (°C/°F and language) use one `Dropdown` component: a button that opens a listbox below it (the ARIA select-only pattern: `aria-haspopup="listbox"`, `aria-expanded`, the list takes focus and points at the active option with `aria-activedescendant`; arrows, Home/End, Enter/Space, Escape, Tab, a click outside closes it). For the 19 languages it also does what a native select gives for free: the list scrolls within a max height (scrolling the list itself, not the page) and typed letters jump to an option ("ne" → Nederlands, "p" again → the next language on "p"). Each language name carries `lang`, so screen readers pronounce it. The buttons have fixed widths, so the search field does not jump when a choice changes. The cost is our own code for what the browser did before; the gain is the same look and behaviour in every browser.
- **Converted on the client:** the API and both caches stay in Celsius. Asking Open-Meteo for Fahrenheit would double the cache keys and provider requests for the same place, and a cached forecast could not be re-shown in the other unit.
- **Convert, then round:** `useUnits().temp(celsius)` returns the whole number to show; `deg` only formats. Rounding first would be off by a degree (14.4 °C is 58 °F, rounded-first 14 °C gives 57 °F). The day-over-day comparison compares converted values, so "4° warmer" is a difference in °F, without the +32 offset. Range bars need no change: the conversion is linear.
- **Trade-offs:** the visible "14°" has no unit letter, as in most weather apps; the unit is in the header switch. Screen readers say "14 degrees" (the switch says which). Wind keeps its own unit: a separate setting if needed, since many people mix them (°C with mph in the UK).

## Alternatives considered

- Next.js full-stack: simpler deploy, but blurs the client/server boundary
- Serverless functions: cheap and scalable, but cold starts and no in-memory cache
- Calling Open-Meteo directly from the browser: fastest to build, but no caching or provider abstraction

## Shared package

`packages/shared` (`@weather/shared`) is used by the server and the web client, and is ready for a future mobile app.

Included: API types, error codes and error body shape, Zod schemas for request parameters, limits and defaults, weather helpers (`describeWeather`, which returns a condition key and an icon kind such as `partly-cloudy`, `rangePosition`, `formatDay`, `formatHour`, `compareWithYesterday`) language helpers (`matchLanguage`, `isRtl`) and an environment-neutral API client created with `createApiClient({ baseUrl })`.

Excluded on purpose: the `WeatherProvider` interface, Open-Meteo response types, cache and services (server internals), React components, hooks and CSS (client-specific), environment configuration.

Rule: code in `shared` must run unchanged in Node.js, browsers and React Native — no Node APIs, DOM, Express or bundler-specific features.
