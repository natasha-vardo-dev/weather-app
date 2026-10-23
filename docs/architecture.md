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
- Caches responses: forecasts for 10 minutes, city searches for 24 hours
- Normalises provider data into our own model
- Lets us switch providers by adding a new adapter

## Caching

Forecast cache keys round coordinates to 2 decimals (~1 km), so nearby requests share an entry.
Every forecast also includes yesterday (Open-Meteo `past_days=1`), so it is not a request parameter and not part of the key: still one provider call per place.
Every forecast also includes the next 24 hours (`forecast_hours=24`, starting at the current hour), again with no extra provider call. Because of the 10-minute cache, right after the hour changes the first "Now" slot may still be the previous hour for a few minutes; accepted to keep provider usage flat.
The UI uses yesterday for one line under the current weather ("3° warmer than yesterday", comparing daily highs) rather than a row in the forecast list, which stays forward-looking.
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

## Alternatives considered

- Next.js full-stack: simpler deploy, but blurs the client/server boundary
- Serverless functions: cheap and scalable, but cold starts and no in-memory cache
- Calling Open-Meteo directly from the browser: fastest to build, but no caching or provider abstraction

## Shared package

`packages/shared` (`@weather/shared`) is used by the server and the web client, and is ready for a future mobile app.

Included: API types, error codes and error body shape, Zod schemas for request parameters, limits and defaults, weather helpers (`describeWeather`, which returns a label and an icon kind such as `partly-cloudy`, `rangePosition`, `formatDay`, `formatHour`, `compareWithYesterday`) and an environment-neutral API client created with `createApiClient({ baseUrl })`.

Excluded on purpose: the `WeatherProvider` interface, Open-Meteo response types, cache and services (server internals), React components, hooks and CSS (client-specific), environment configuration.

Rule: code in `shared` must run unchanged in Node.js, browsers and React Native — no Node APIs, DOM, Express or bundler-specific features.
