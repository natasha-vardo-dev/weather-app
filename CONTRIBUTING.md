# Contributing

How to set the project up, make a change and know it is done. What the app does is in the [README](README.md); how
each part works is in [docs/architecture.md](docs/architecture.md) (start with its "Where to start" table); why it is so
is in [docs/adr/](docs/adr/README.md).

## Set up

Node 24 (`.nvmrc`; `nvm use`). From the repository root:

```bash
npm install
cp server/.env.example server/.env
npm run dev        # shared (watch), API on :3001, site on :5173
```

The site in `npm run dev` has no service worker and no Content-Security-Policy, and a restart of the API shows a short
`502` from Vite's proxy. To see the site as users get it (offline, push, headers):

```bash
npm run build && npm run preview -w client   # http://localhost:4173
```

## Where things are

| Path                      | What                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `packages/shared`         | Types, schemas (Zod), the API client, rules both sides use; built to `dist` (`npm run build:shared`) |
| `server/src/routes`       | HTTP: input checked, service called                                                                  |
| `server/src/services`     | Logic and caches                                                                                     |
| `server/src/providers`    | One adapter per external API (Open-Meteo, MeteoAlarm, Nominatim, ipwho.is, FCM)                      |
| `client/src/hooks`        | Data loading (`useForecast`, `useAirQuality`, `useAlerts`, …)                                        |
| `client/src/components`   | UI; `pages/` for the routes                                                                          |
| `client/src/i18n/locales` | The 8 languages: en, de, fr, es, it, pl, uk, ru                                                      |
| `client/e2e`              | Playwright tests on the production build                                                             |
| `deploy/vm`               | The API's VM: `setup.sh`, `deploy.sh`, the systemd unit                                              |

## Checks

```bash
npm test                    # unit and component tests, every package
npm run test:e2e            # Playwright + axe on the production build (once: npx playwright install chromium)
npm run lint
npm run typecheck
npm run format              # before every commit: there is no hook, CI runs format:check
npm run openapi             # after changing a schema in shared: regenerates docs/openapi.json (CI checks it)
npm run providers:check -w server   # the real Open-Meteo and MeteoAlarm still read (daily in CI)
```

CI runs all but the last on every pull request and push to `main` (and every Monday), and on pull requests also fails
on a breaking API change within `/api/v1` (oasdiff; not yet run on a real one, see
[Not verified live](docs/operations.md#not-verified-live)). The provider check runs daily on its own
(`.github/workflows/providers.yml`).

## Rules that are easy to miss

**`shared`** runs unchanged in Node, the browser and React Native: no Node APIs, DOM or Express. Nothing of the
server's internals goes there. The client imports plain functions only, not Zod schemas (about 12 KB gzipped more).
`ZodError` is re-exported from `shared`.

**Server:**

- a provider is known only to its adapter in `providers/`; tests use fakes (`server/tests/fakeProvider.ts`);
- settings come only through `config.ts`; in production an unsafe setting stops the start;
- a provider's answer is read through `providers/http.ts` (size limit) and checked before it is cached; a URL taken
  from a provider's data is fetched only if its host is on an allow list;
- a new provider call goes through `instrumentFetch` and the budget (`Metrics.budget`);
- errors go to the one handler in `app.ts` as `{ error: { code, message } }`, codes in `shared/src/errors.ts`;
- everything that changes an answer is in its cache key; errors are not cached; `Cache-Control` only on success;
- logs never hold IP addresses, coordinates or search words.

**API:** within `/api/v1` only compatible changes: an optional field, a new endpoint, a new error code. Removing,
renaming, retyping or making something required needs a new version. Note that oasdiff in CI fails on a new error code
in a response all the same; a code only the client makes stays out of the API's schema (`ApiErrorCode`).

**Client:**

- every new text goes into all 8 locale files (the `Messages` type will not compile without them); numbers and dates
  through `Intl` (`num`, `deg`);
- text contrast at least 4.5:1, icons 3:1 (axe in e2e catches it); fills on the blue background usually break it;
- React Compiler rules are errors: derive state while rendering instead of copying it in an effect; read the clock
  through `useNow`, not `Date.now()` in render;
- `localStorage` and API answers are untrusted input: check them when read;
- a new service receiving user data, or new stored data, means updating `/privacy` (`PrivacyPage.tsx`) and the
  Privacy section of the architecture notes; fonts and other files come from our site, not a CDN;
- functions serialized into `sw.js` (Workbox plugins, `splitForecastBatch`) must not reference outside names.

**Tests:** e2e runs on the production build with `/api` mocked (`client/e2e/mockApi.ts`); a request the mocks do not
know, or an error in the console (CSP included), fails the test. No test may depend on today's date.

## Push notifications (optional)

Free: Firebase Cloud Messaging keeps the subscriptions (topics), an external scheduler runs the check, and Firestore in the same project keeps what was sent ([ADR 0018](docs/adr/0018-durable-operational-state.md)).

1. Create a project in the [Firebase Console](https://console.firebase.google.com) (free Spark plan) and add a web app.
2. Client (`client/.env`, see `client/.env.example`): the web app's config and the Web Push key (Project settings → Cloud Messaging → Web Push certificates). Public values.
3. Server (`server/.env`): `FIREBASE_SERVICE_ACCOUNT` (Project settings → Service accounts → Generate new private key; the JSON as one line or base64) and `ALERTS_NOTIFY_SECRET` (a long random string). Secrets: never commit them.
   Then give that service account (`firebase-adminsdk-…@<project>.iam.gserviceaccount.com`) the roles **Firebase Cloud Messaging API Admin** and **Cloud Datastore User** in the Google Cloud Console (IAM → edit the account → Add another role). `firebase-admin` 14 manages topic subscriptions through the FCM v1 API, which needs the first; without it, turning notifications on or off fails with a 502. The second lets the server keep its state in Firestore.
   Create the Firestore database: Firebase Console → Build → Firestore Database → Create database, production mode, a European location (no client reads it; the default rules that deny everything are right, the server's service account is not bound by them). Without it every notifier run fails (visible in the scheduler and on `/api/health/notify`) instead of forgetting what was sent.
4. In production, also the `VITE_FIREBASE_*` values on Vercel and the scheduler job: [deploy-aws.md, step 6](docs/deploy-aws.md#6-the-site-and-the-scheduler).

Notifications need the production build (the service worker is off in `npm run dev`): `npm run build && npm run preview -w client`. On iPhone they work only from the app added to the Home Screen (iOS 16.4+).

To check delivery without waiting for a real warning, send a test one ("Test warning", gone in an hour) with the server's `FIREBASE_SERVICE_ACCOUNT` from `server/.env`, which must be of the same Firebase project as the site:

```bash
npm run push:test -w server -- --token <token>          # one device; its token, in the page's console after turning the bell on:
                                                        # JSON.parse(localStorage.getItem('alert-notifications:v1')).token
npm run push:test -w server -- 52.23 21.01 --dry-run    # the place's areas and topics, nothing sent
npm run push:test -w server -- 52.23 21.01 --everyone   # every device subscribed to that place, real users included
```

The token mode checks FCM and the service worker; the topic mode also checks the subscription itself (the only way on an iPhone, which has no console), but reaches everyone subscribed there.

Tests mock Firebase, so check push by hand after updating `firebase` or `firebase-admin`.

## A decision

When you choose between options, write a record in [docs/adr/](docs/adr/README.md) from `template.md`: the context,
the choice, its cost and what was rejected. [docs/architecture.md](docs/architecture.md) only says how things work,
with a `Why:` link to the record. Records are not rewritten later; a new one supersedes them.

## Done means

- it works in the deployed version, not only locally;
- it is covered by tests;
- it was checked in a browser (a production build for anything the service worker touches);
- it is described in the README or `docs/`;
- anything not checked live is written down as such.

## Branches and merging

Work on a short-lived branch and open a pull request into `main`; merge it with a **merge commit**
(`.git-blame-ignore-revs` relies on the history), then deploy ([docs/deploy-aws.md](docs/deploy-aws.md#updating-and-rolling-back)).
There is no long-lived `dev` branch ([ADR 0032](docs/adr/0032-dependabot-into-main.md)).

Dependabot opens its pull requests against `main` too. When one fails CI, comment `@dependabot rebase` rather than
pressing "Update branch". A Firebase update needs a live push check before merging (above).

## Known quirks

- TypeScript 7 in the packages, 5.9 at the root: `typescript-eslint` supports `<6.1` only. Remove when it supports 7.
- `@types/node` follows the major version of Node in `.nvmrc` (Dependabot is told not to bump majors).
- The `overrides` entry for `@grpc/grpc-js` goes once `firebase` depends on a fixed version.
