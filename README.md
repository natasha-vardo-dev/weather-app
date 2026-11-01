# Weather Forecast App

A web application that shows the current weather and a 10-day forecast for a selected city.

**Live demo:** [link to deployed app]

## Features

- City search with autocomplete and keyboard navigation
- Shareable links for each place, the same in every language, e.g. `/weather/756135-warsaw` (a place without a city, found by location: `/weather/52.25,21.05?name=…`); back/forward and refresh work
- Current conditions: temperature, condition, feels like, high and low; the hourly strip shows the chance of rain in likely hours, and sunrise and sunset
- Details as tiles below the 10-day forecast, each with a short explanation: precipitation (chance, millimetres in the next 24 hours), wind (direction, gusts), humidity (dew point and how the air feels), air quality (European AQI for places in Europe, US AQI elsewhere), UV index (WHO level, when sun protection is needed), sunrise and sunset (whichever comes next), pressure (rising or falling in the next 3 hours), visibility. Tiles with hourly data open below the grid: a 24-hour chart (precipitation, wind, humidity, UV, pressure) or the pollutants (PM2.5, PM10, ozone, NO₂) as bars against the WHO daily guidelines
- 10-day forecast with temperature range bars and rain probability
- Favourite cities (up to 10), saved in the browser: shown as cards with current weather, condition and today's high/low on the start page, and as a strip of tiles on city pages
- Loading, empty and error states with retry
- 8 interface languages (English, German, French, Spanish, Italian, Polish, Ukrainian, Russian), picked from the system language by default, with a switcher; dates, times, numbers and units follow the locale
- °C or °F: Fahrenheit by default only when both the browser locale and the time zone are of the US or a few other regions, Celsius otherwise; a switcher in the header remembers the choice
- Weather for your location: a crosshair in the search field (the browser asks for permission only when it is pressed). If the browser can't tell the position, the message offers "Try again" and the city guessed from the IP address ("Looks like you're in Warsaw"), marked as approximate. Place names come from OpenStreetMap
- Push notifications about storms (optional, needs a free Firebase project): a bell on the city page turns them on for that place; one notification per warning, a closed one does not come back, only a raised level notifies again
- Installable as an app (PWA): opens offline with the last loaded forecasts and a banner saying they may be out of date; on iPhone and iPad the start page explains how to add it to the Home Screen
- Official weather warnings in Europe (national weather services via MeteoAlarm): level, type and when on the city page, the issuer's own text on demand
- Responsive layout, light/dark mode, accessible combobox
- Privacy: no accounts, cookies, analytics or ads; the font is served from the site, not Google Fonts; a privacy policy at `/privacy` (linked in the footer) says what goes where ([docs/architecture.md](docs/architecture.md#privacy))

## Tech stack

| Layer    | Technology                                                                                |
| -------- | ----------------------------------------------------------------------------------------- |
| Frontend | React 19, React Router 8, TypeScript, Vite 8                                              |
| Backend  | Node.js 24, Express 5, TypeScript, Zod                                                    |
| Weather  | Open-Meteo (forecast + geocoding)                                                         |
| Testing  | Vitest, Testing Library, Supertest, Playwright, axe-core, ESLint, Prettier                |
| CI       | GitHub Actions (audit, format, lint, typecheck, test, build; e2e), weekly too; Dependabot |

## Architecture

```
Browser (React SPA) → Backend for Frontend (Express) → Open-Meteo
                              ↓
                       In-memory TTL cache
```

See [docs/architecture.md](docs/architecture.md) for how it works and [docs/adr/](docs/adr/README.md) for the main
decisions and the alternatives considered.

## Project structure

```
packages/shared/   API contract and shared logic (@weather/shared)
server/            Express BFF: routes → services → providers
client/            React web app
docs/              Architecture notes
```

## Getting started

Requires Node.js 24 (24.22.2 or later, below 25: `engines` in `package.json`, and npm warns otherwise; `.nvmrc` pins the major version, so `nvm use` picks it). CI reads the same `.nvmrc` and installs the latest 24.x; on the VM Node 24 comes from NodeSource's apt repository, which `deploy/oracle/setup.sh` adds to Ubuntu's automatic updates (with Caddy's), restarting the API after an upgrade; the server logs its `process.version` at start (`API listening`) to check what runs.

```bash
npm install
cp server/.env.example server/.env
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001/api/health

The API restarts when its code changes (`tsx watch`), and for that moment the frontend gets `502 Bad Gateway` from Vite's proxy for API calls (`http proxy error` in the terminal): reload, nothing is broken. Builds of `@weather/shared` that change nothing (`npm test` and `npm run typecheck` build it first) no longer cause a restart: the build is incremental and writes nothing then.

### Push notifications (optional)

Free: Firebase Cloud Messaging keeps the subscriptions (topics), an external scheduler runs the check, and Firestore in the same project keeps what was sent ([ADR 0018](docs/adr/0018-durable-operational-state.md)).

1. Create a project in the [Firebase Console](https://console.firebase.google.com) (free Spark plan) and add a web app.
2. Client (`client/.env`, see `client/.env.example`): the web app's config and the Web Push key (Project settings → Cloud Messaging → Web Push certificates). Public values.
3. Server (`server/.env`): `FIREBASE_SERVICE_ACCOUNT` (Project settings → Service accounts → Generate new private key; the JSON as one line or base64) and `ALERTS_NOTIFY_SECRET` (a long random string). Secrets: never commit them.
   Then give that service account (`firebase-adminsdk-…@<project>.iam.gserviceaccount.com`) the roles **Firebase Cloud Messaging API Admin** and **Cloud Datastore User** in the Google Cloud Console (IAM → edit the account → Add another role). `firebase-admin` 14 manages topic subscriptions through the FCM v1 API, which needs the first; without it, turning notifications on or off fails with a 502. The second lets the server keep its state in Firestore.
   Create the Firestore database: Firebase Console → Build → Firestore Database → Create database, production mode, a European location (no client reads it; the default rules that deny everything are right, the server's service account is not bound by them). Without it every notifier run fails (visible in the scheduler and on `/api/health/notify`) instead of forgetting what was sent.
4. After deploying: a job on [cron-job.org](https://cron-job.org) every 5 minutes, `POST https://<api>/api/internal/alerts/notify` with the header `Authorization: Bearer <ALERTS_NOTIFY_SECRET>`.

Notifications need the production build (the service worker is off in `npm run dev`): `npm run build && npm run preview -w client`. On iPhone they work only from the app added to the Home Screen (iOS 16.4+).

### Dependencies

Dependabot (`.github/dependabot.yml`) opens weekly pull requests into `dev`: minor and patch updates grouped (production and development apart), each major version alone, Firebase alone (its tests use a fake, so check push notifications live before merging), GitHub Actions monthly. CI also runs every Monday with no change at all, so a newly published vulnerability (the production audit fails on high ones) or a test that depends on the date shows up anyway. In the repository's settings (Code security), turn on Dependabot alerts and security updates: those pull requests come as soon as an advisory is out. Not automated: the Node version in `.nvmrc` (once a year, at a new LTS) and the `@grpc/grpc-js` override in `package.json` (drop it once `firebase` updates grpc itself).

### Other commands

```bash
npm test           # unit and component tests
npm run test:e2e   # Playwright in Chromium, with axe accessibility checks (first: npx playwright install chromium)
npm run lint       # ESLint, including React hook rules
npm run format     # Prettier (CI runs format:check)
npm run typecheck  # TypeScript checks
npm run openapi    # regenerate docs/openapi.json after changing the API's schemas
npm run build      # production build
```

## API

The contract is versioned in the path (`/api/v1`); health and internal endpoints are not part of it and have no version. Within a version only compatible changes are made: an optional field or a new endpoint. Anything that breaks a client (a field removed, renamed or retyped, a required one added) goes into a new version, served next to the old one until nobody calls it. The OpenAPI description, [`docs/openapi.json`](docs/openapi.json), is generated from the zod schemas in `@weather/shared` (`npm run openapi`); CI fails if it is out of date and, on pull requests, if it has a breaking change within the same version. Details: [architecture notes](docs/architecture.md#api-versions).

| Method | Endpoint                                             | Description                                                                                                                    |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/v1/locations?q=warsaw&limit=5`                 | Search cities                                                                                                                  |
| GET    | `/api/v1/locations/756135?lang=ru`                   | One place by id, names in a language                                                                                           |
| GET    | `/api/v1/forecast?lat=52.23&lon=21.01&days=10`       | Current weather, next 24 hours, yesterday and daily forecast                                                                   |
| GET    | `/api/v1/forecasts?places=52.23,21.01;50.06,19.94`   | Forecasts for up to 10 places at once (saved cities); each item is a forecast or an error                                      |
| GET    | `/api/v1/air-quality?lat=52.23&lon=21.01`            | Current air quality (European and US AQI)                                                                                      |
| GET    | `/api/v1/alerts?lat=54.21&lon=21.74&lang=pl`         | Official weather warnings in force or announced at a place (Europe, MeteoAlarm), texts in the language where the issuer has it |
| GET    | `/api/v1/places/approximate?lang=ru`                 | The user's city guessed from their IP address (fallback when the browser can't locate them); never cached                      |
| GET    | `/api/v1/places/reverse?lat=52.25&lon=21.05&lang=ru` | The place at the user's location: the city with its coordinates and id (as from search), named via OpenStreetMap Nominatim     |
| POST   | `/api/v1/push/topics`                                | Subscribe or unsubscribe a device's push token to warnings for a place (only with Firebase configured)                         |
| POST   | `/api/internal/alerts/notify`                        | Push new warnings; called every 5 minutes by an external scheduler, needs `Authorization: Bearer <ALERTS_NOTIFY_SECRET>`       |
| GET    | `/api/health`                                        | Health check: the process answers (does not call the weather provider)                                                         |
| GET    | `/api/health/quota`                                  | 503 while a provider limit is used to 80% or more (for an uptime monitor)                                                      |
| GET    | `/api/health/notify`                                 | 503 when no notifier run has fully succeeded for 30 minutes (only with Firebase configured; for an uptime monitor)             |
| GET    | `/api/internal/metrics`                              | Cache hit rates, provider calls against their limits, rate-limited requests; needs `Authorization: Bearer <METRICS_SECRET>`    |

Errors use one format: `{ "error": { "code": "INVALID_REQUEST", "message": "..." } }`.

Requests are limited per IP address (a minute's window): 300 for the API as a whole, 30 batches for `/api/v1/forecasts` (up to 10 places each), 60 for city search, 10 for `/api/v1/places/*`, 60 for `/api/v1/push/*` (plus 120 changes an hour per push token). Over the limit: `429` with code `RATE_LIMITED` and the standard `RateLimit` and `Retry-After` headers.

## Deployment

- Frontend: Vercel, root directory `client`. `client/middleware.ts` (Vercel Routing Middleware) forwards `/api/*` to the backend; `client/vercel.json` serves `index.html` for all other paths, so client-side routes survive a refresh. Environment variables on Vercel: `API_ORIGIN` (the backend's URL, e.g. `https://158-101-1-2.sslip.io`), `PROXY_SECRET` (a long random string, the same as on the VM), and the `VITE_FIREBASE_*` values for push notifications.
- Backend: an Oracle Cloud Always Free VM with its own IP address, Node under systemd behind Caddy (HTTPS); set-up, updates and rollback step by step in [docs/deploy-oracle.md](docs/deploy-oracle.md). Not Render: free Render shares its outgoing addresses, and Open-Meteo, which counts its limits per address, refused every forecast there ([ADR 0019](docs/adr/0019-api-on-oracle-free-vm.md)). The settings are in `/etc/weather-api.env` on the VM (`deploy/oracle/api.env.example`). With `NODE_ENV=production` (set by the systemd unit) the server checks its settings at start and refuses to start, listing every problem, without `PROXY_SECRET` (32+ characters) or `TRUST_PROXY`, with `IP_SELF_LOOKUP`, with Firebase but no `ALERTS_NOTIFY_SECRET`, or with a short secret ([architecture notes](docs/architecture.md#reliability-and-security)). Do not set `IP_SELF_LOOKUP` there (it is for local development), nor `CORS_ORIGIN` (the site calls the API through its own origin). Set `PROXY_SECRET` (the same value as on Vercel): the API then answers only requests that came through the frontend's proxy and takes the user's IP from it (`X-Client-IP`), so rate limits and the approximate location cannot be fooled by a forged `X-Forwarded-For` sent straight to the VM. After deploying, check: turning notifications on and off works (the Content-Security-Policy allows the Firebase hosts push uses; tests cannot exercise push); the site works; a request straight to `https://<api>/api/v1/forecast?lat=52.23&lon=21.01` gets 404; "Looks like you're in …" (the approximate location) names your own city, so the user's address reaches the API. Set `TRUST_PROXY=1` as well (Caddy; used only when a request carries no `X-Client-IP`). Optional: `METRICS_SECRET` (enables `/api/internal/metrics`), `LOG_LEVEL` (`info` by default; `debug` logs every provider call).
- Logs are JSON lines on stdout (pino), kept by journald on the VM (`journalctl -u weather-api`); every 15 minutes a `metrics` line records cache hit rates and provider usage, and a warning is logged when a provider's usage passes 80% of a limit.
- Monitoring: an uptime monitor (UptimeRobot or Better Stack, free) on the site, `/api/health`, `/api/health/quota` (503 at 80% of a provider limit) and, with push, `/api/health/notify`, with email alerts. Set-up and what each alert means: [docs/operations.md](docs/operations.md).

Serving the API from the frontend's domain avoids CORS and keeps future auth cookies first-party.

## Assumptions

- [No user accounts needed: favourites live in the browser (`localStorage`), so they do not sync between devices]
- [10 days of forecast is enough: beyond that Open-Meteo still returns data (up to 16 days), but accuracy drops sharply]
- [Only temperature has a unit switch (°C/°F); wind stays in km/h]
- [UI translations for 8 languages are machine-quality drafts: they need a review by native speakers before a real release]
- [Weather warnings cover Europe only (MeteoAlarm's ~38 countries). No banner means no warning was found, not a promise of calm weather; elsewhere there are none yet (the US National Weather Service would be the next source)]
- [Push notifications: a warning issued while the server was down (deploy, restart) is pushed on the first run after it, thanks to the state in Firestore; without Firestore (local development) it is not, but it still shows on the page]
- [Availability is best effort: the API runs on one free VM in one region, deployed by hand, and a deploy or reboot is a few seconds without it. That is the price of staying free (ADR 0004, ADR 0019); what must not be lost on a restart (notifications sent, provider usage) is kept in Firestore, so a rebuilt VM carries on, and a second machine or a paid host is the step if an availability target ever requires it]
- [One server instance: per-IP rate limits are counted in its memory, so during a deploy's short overlap each instance counts on its own]

## Trade-offs and decisions

- City URLs use the GeoNames id (`/weather/756135-warsaw`), which Open-Meteo and yr.no share, so a link is the same in every language and does not depend on the weather provider; places found by location have no id and keep coordinates in the URL ([ADR 0006](docs/adr/0006-place-urls-by-id.md)).
- In-memory cache instead of Redis: enough for a single instance; the cache sits behind a small class, so it is easy to replace.
- Monorepo with npm workspaces: `server`, `client` and `packages/shared` change together and are reviewed as one unit.
- `@weather/shared` holds the API contract (types, error format, validation schemas, constants), environment-neutral weather helpers and the API client. Server internals (providers, cache) stay out of it so clients never depend on where data comes from.

## What I would do next

- [Wind unit setting; accounts so favourites sync between devices]
- [More e2e scenarios (geolocation, offline, notifications); the React Compiler itself (its lint rules are on)]
- [Redis cache and rate limiting, so counters survive restarts]
