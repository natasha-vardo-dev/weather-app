# Weather Forecast App

A web application that shows the current weather and a 10-day forecast for a selected city.

**Live demo:** [link to deployed app]

## Features

- City search with autocomplete and keyboard navigation
- Shareable links for each place, e.g. `/weather/52.23,21.01?name=Warsaw&country=Poland`; back/forward and refresh work
- Current conditions: temperature, condition, feels like, high and low; the hourly strip shows the chance of rain in likely hours, and sunrise and sunset
- Details as tiles below the 10-day forecast, each with a short explanation: precipitation (chance, millimetres in the next 24 hours), wind (direction, gusts), humidity (dew point and how the air feels), air quality (European AQI for places in Europe, US AQI elsewhere), UV index (WHO level, when sun protection is needed), sunrise and sunset (whichever comes next), pressure (rising or falling in the next 3 hours), visibility. Tiles with hourly data open below the grid: a 24-hour chart (precipitation, wind, humidity, UV, pressure) or the pollutants (PM2.5, PM10, ozone, NO₂) as bars against the WHO daily guidelines
- 10-day forecast with temperature range bars and rain probability
- Favourite cities (up to 10), saved in the browser: shown as cards with current weather, condition and today's high/low on the start page, and as a strip of tiles on city pages
- Loading, empty and error states with retry
- 19 interface languages, picked from the system language by default, with a switcher; dates, times, numbers and units follow the locale; right-to-left layout for Arabic and Hebrew
- °C or °F: Fahrenheit by default only when both the browser locale and the time zone are of the US or a few other regions, Celsius otherwise; a switcher in the header remembers the choice
- Weather for your location: a crosshair in the search field (the browser asks for permission only when it is pressed). If the browser can't tell the position, the message offers "Try again" and the city guessed from the IP address ("Looks like you're in Warsaw"), marked as approximate. Place names come from OpenStreetMap
- Push notifications about storms (optional, needs a free Firebase project): a bell on the city page turns them on for that place; one notification per warning, a closed one does not come back, only a raised level notifies again
- Installable as an app (PWA): opens offline with the last loaded forecasts and a banner saying they may be out of date; on iPhone and iPad the start page explains how to add it to the Home Screen
- Official weather warnings in Europe (national weather services via MeteoAlarm): level, type and when on the city page, the issuer's own text on demand
- Responsive layout, light/dark mode, accessible combobox

## Tech stack

| Layer    | Technology                       |
|----------|----------------------------------|
| Frontend | React 18, TypeScript, Vite       |
| Backend  | Node.js, Express, TypeScript, Zod |
| Weather  | Open-Meteo (forecast + geocoding) |
| Testing  | Vitest, Supertest                |
| CI       | GitHub Actions                   |

## Architecture

```
Browser (React SPA) → Backend for Frontend (Express) → Open-Meteo
                              ↓
                       In-memory TTL cache
```

See [docs/architecture.md](docs/architecture.md).

## Project structure

```
packages/shared/   API contract and shared logic (@weather/shared)
server/            Express BFF: routes → services → providers
client/            React web app
docs/              Architecture notes and open questions
```

## Getting started

Requires Node.js 20.19+ (the PWA build plugin needs it).

```bash
npm install
cp server/.env.example server/.env
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001/api/health

### Push notifications (optional)

Free, no database: Firebase Cloud Messaging keeps the subscriptions (topics), an external scheduler runs the check.

1. Create a project in the [Firebase Console](https://console.firebase.google.com) (free Spark plan) and add a web app.
2. Client (`client/.env`, see `client/.env.example`): the web app's config and the Web Push key (Project settings → Cloud Messaging → Web Push certificates). Public values.
3. Server (`server/.env`): `FIREBASE_SERVICE_ACCOUNT` (Project settings → Service accounts → Generate new private key; the JSON as one line or base64) and `ALERTS_NOTIFY_SECRET` (a long random string). Secrets: never commit them.
4. After deploying: a job on [cron-job.org](https://cron-job.org) every 5 minutes, `POST https://<api>/api/internal/alerts/notify` with the header `Authorization: Bearer <ALERTS_NOTIFY_SECRET>`. It also keeps a free Render instance awake.

Notifications need the production build (the service worker is off in `npm run dev`): `npm run build && npm run preview -w client`. On iPhone they work only from the app added to the Home Screen (iOS 16.4+).

### Other commands

```bash
npm test           # all tests
npm run typecheck  # TypeScript checks
npm run build      # production build
```

## API

| Method | Endpoint                                 | Description            |
|--------|------------------------------------------|------------------------|
| GET    | `/api/locations?q=warsaw&limit=5`        | Search cities          |
| GET    | `/api/locations/756135?lang=ru`          | One place by id, names in a language |
| GET    | `/api/forecast?lat=52.23&lon=21.01&days=10` | Current weather, next 24 hours, yesterday and daily forecast |
| GET    | `/api/air-quality?lat=52.23&lon=21.01`   | Current air quality (European and US AQI) |
| GET    | `/api/alerts?lat=54.21&lon=21.74&lang=pl` | Official weather warnings in force or announced at a place (Europe, MeteoAlarm), texts in the language where the issuer has it |
| GET    | `/api/places/approximate?lang=ru` | The user's city guessed from their IP address (fallback when the browser can't locate them); never cached |
| GET    | `/api/places/reverse?lat=52.25&lon=21.05&lang=ru` | The place at the user's location: the city with its coordinates and id (as from search), named via OpenStreetMap Nominatim |
| POST   | `/api/push/topics` | Subscribe or unsubscribe a device's push token to warnings for a place (only with Firebase configured) |
| POST   | `/api/internal/alerts/notify` | Push new warnings; called every 5 minutes by an external scheduler, needs `Authorization: Bearer <ALERTS_NOTIFY_SECRET>` |
| GET    | `/api/health`                            | Health check           |

Errors use one format: `{ "error": { "code": "INVALID_REQUEST", "message": "..." } }`.

## Deployment

- Frontend: Vercel, root directory `client`. `client/vercel.json` rewrites `/api/*` to the backend (replace `YOUR-API` with the real URL) and serves `index.html` for all other paths, so client-side routes survive a refresh.
- Backend: Render, root directory `server`. Do not set `IP_SELF_LOOKUP` there (it is for local development). Set `TRUST_PROXY=2` (Vercel's rewrite and Render's proxy), so the approximate location sees the user's IP; only that many proxies are trusted with `X-Forwarded-For`, otherwise anyone could fake their address.

Serving the API from the frontend's domain avoids CORS and keeps future auth cookies first-party.

## Assumptions

- [No user accounts needed: favourites live in the browser (`localStorage`), so they do not sync between devices]
- [10 days of forecast is enough: beyond that Open-Meteo still returns data (up to 16 days), but accuracy drops sharply]
- [Only temperature has a unit switch (°C/°F); wind stays in km/h]
- [UI translations for 19 languages are machine-quality drafts: they need a review by native speakers before a real release]
- [Weather warnings cover Europe only (MeteoAlarm's ~38 countries). No banner means no warning was found, not a promise of calm weather; elsewhere there are none yet (the US National Weather Service would be the next source)]
- [Push notifications: a warning issued while the server was down (deploy, restart) is not pushed; it still shows on the page]
- [MeteoAlarm's region borders have no licence of their own; assumed to follow MeteoAlarm's data terms (see docs/questions.md)]

## Trade-offs and decisions

- Place URLs use rounded coordinates, not provider location IDs: links keep working if the weather provider changes, and identical URLs for nearby places are friendlier to HTTP caching. Name and country in the query string are for display only.

- In-memory cache instead of Redis: enough for a single instance; the cache sits behind a small class, so it is easy to replace.
- Monorepo with npm workspaces: `server`, `client` and `packages/shared` change together and are reviewed as one unit.
- `@weather/shared` holds the API contract (types, error format, validation schemas, constants), environment-neutral weather helpers and the API client. Server internals (providers, cache) stay out of it so clients never depend on where data comes from.

## What I would do next

- [Wind unit setting; accounts so favourites sync between devices]
- [ESLint, component and e2e tests with Playwright]
- [Redis cache and rate limiting, monitoring]
