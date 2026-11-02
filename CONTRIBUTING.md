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

CI runs all of these on every pull request, and fails on a breaking API change within `/api/v1` (oasdiff).

## Rules that are easy to miss

**`shared`** runs unchanged in Node, the browser and React Native: no Node APIs, DOM or Express. Nothing of the
server's internals goes there. The client imports plain functions only, not Zod schemas (about 12 KB gzipped more).

**Server:**

- a provider is known only to its adapter in `providers/`; tests use fakes (`server/tests/fakeProvider.ts`);
- settings come only through `config.ts`; in production an unsafe setting stops the start;
- a provider's answer is read through `providers/http.ts` (size limit) and checked before it is cached;
- a new provider call goes through `instrumentFetch` and the budget (`Metrics.budget`);
- errors go to the one handler in `app.ts` as `{ error: { code, message } }`, codes in `shared/src/errors.ts`;
- everything that changes an answer is in its cache key; errors are not cached; `Cache-Control` only on success;
- logs never hold IP addresses, coordinates or search words.

**API:** within `/api/v1` only compatible changes: an optional field, a new endpoint, a new error code. Removing,
renaming, retyping or making something required needs a new version.

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

## Checking push notifications

Tests mock Firebase, so after updating it, check by hand. With `FIREBASE_SERVICE_ACCOUNT` in `server/.env` (same
Firebase project as the site):

```bash
npm run push:test -w server -- --token <token>   # one device; the token is in the page's localStorage after turning the bell on
```

More options (a place's topics, dry run) are in the README. The service account needs the **Firebase Cloud Messaging
API Admin** and **Cloud Datastore User** roles, and the Firestore database must exist.

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

Pull requests go to `main` and are merged with a **merge commit** (`.git-blame-ignore-revs` relies on the history).
Dependabot opens its pull requests against `dev`; when one fails CI, comment `@dependabot rebase` rather than pressing
"Update branch".

## Known quirks

- TypeScript 7 in the packages, 5.9 at the root: `typescript-eslint` supports `<6.1` only. Remove when it supports 7.
- `@types/node` follows the major version of Node in `.nvmrc` (Dependabot is told not to bump majors).
- The `overrides` entry for `@grpc/grpc-js` goes once `firebase` depends on a fixed version.
