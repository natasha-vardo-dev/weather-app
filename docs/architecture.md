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
Air quality comes from a separate Open-Meteo API (another host), so it has its own endpoint (`/api/air-quality`) and cache: 30 minutes, because the provider updates it hourly, with the same ~1 km key rounding. It is separate from `/forecast` so that the forecast never fails or waits because of it; the client loads both in parallel and simply hides the air quality item if that request fails. The cost is one more provider call per place, at most 48 a day with this TTL (forecast: up to 144).
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
Data fetching lives in hooks (`useLocationSearch`, `useForecast`) with debouncing and request cancellation.

## Languages

- **Default:** the first of `navigator.languages` the app supports (matched by base language, so `de-AT` picks German), otherwise English. An explicit choice in the switcher is saved in `localStorage` and wins next time.
- **Translations** live in `client/src/i18n/locales/`, one typed file per language (19 bundled, ~15 KB gzip in total). The `Messages` type makes a missing key a compile error. No i18n library: plurals use `Intl.PluralRules`, everything else is plain functions. With many more languages or translators working in a TMS, `i18next`/`FormatJS` with lazy-loaded JSON would be the next step.
- **No string translation for numbers and dates:** weekdays, clock time (12/24-hour by locale), percent and wind units come from `Intl`, so they are right for every locale, not only the translated ones.
- **The API stays language-neutral:** it returns condition keys (`partly-cloudy`) and error codes, and the client translates them. Only place search takes `lang`, because Open-Meteo returns city, region and country names in that language; `lang` is part of the search cache key.
- **One digit system per screen:** every number, including temperatures and the `{n}` in plurals, goes through `Intl.NumberFormat` for the user's full locale. Language files are functions of the formatters (`MessagesFactory`), because digits depend on the locale, not the language: `ar-EG` shows `١٤°`, plain `ar` shows `14°`. In right-to-left languages a temperature is wrapped in a bidi isolate (U+2066…U+2069): otherwise the degree sign drifts to the left of Arabic-Indic digits.
- **Right-to-left:** `<html dir>` is set for Arabic and Hebrew; CSS uses logical alignment (`text-align: end`), and each day's low, bar and high stay one left-to-right block, so the cold-to-warm bar matches its labels.
- **Known limitation:** the place name in the URL is stored in the language it was searched in, and the provider has no reverse geocoding, so switching language does not rename an open city.

## Alternatives considered

- Next.js full-stack: simpler deploy, but blurs the client/server boundary
- Serverless functions: cheap and scalable, but cold starts and no in-memory cache
- Calling Open-Meteo directly from the browser: fastest to build, but no caching or provider abstraction

## Shared package

`packages/shared` (`@weather/shared`) is used by the server and the web client, and is ready for a future mobile app.

Included: API types, error codes and error body shape, Zod schemas for request parameters, limits and defaults, weather helpers (`describeWeather`, which returns a condition key and an icon kind such as `partly-cloudy`, `rangePosition`, `formatDay`, `formatHour`, `compareWithYesterday`) language helpers (`matchLanguage`, `isRtl`) and an environment-neutral API client created with `createApiClient({ baseUrl })`.

Excluded on purpose: the `WeatherProvider` interface, Open-Meteo response types, cache and services (server internals), React components, hooks and CSS (client-specific), environment configuration.

Rule: code in `shared` must run unchanged in Node.js, browsers and React Native — no Node APIs, DOM, Express or bundler-specific features.
