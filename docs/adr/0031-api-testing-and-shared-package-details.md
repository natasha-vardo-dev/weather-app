# 0031. Details of API versioning, testing and the shared package

- Status: Accepted
- Date: 2026-11-02

## Context

This record holds the smaller reasons around API versions, testing, the shared package and the alternatives to a
backend; `docs/architecture.md` describes only how they work. The main decisions are in
[0001](0001-backend-for-frontend.md), [0002](0002-monorepo-shared-contract.md), [0012](0012-api-versioning.md) and
[0015](0015-testing-strategy.md); this one keeps the smaller reasons and lessons they do not state.

Clients are not updated together with the server: the client (Vercel) and the server (a VM on AWS) deploy separately,
an open tab runs its old code until reloaded, the browser's HTTP cache and the service worker keep answers for up to a
day, and a mobile app would run old code for months. This already broke once: after the reverse-geocoding answer
changed shape, a day-old cached answer without coordinates crashed the page, and moving the endpoint to a new URL fixed
it.

All unit, component and e2e tests run on recorded or made-up answers, so a change of format at Open-Meteo or
MeteoAlarm would otherwise be found by users first.

## Decision

- **Version in the path:** the path is the key of every cache (browser, service worker, CDN), so a new version never
  sees answers of the old shape.
- **Unknown error codes are compatible:** clients show an unknown code as a general error, so a new code needs no new
  version.
- **Strict response schemas:** a field the server sends but the contract does not list fails the server's tests, so
  the contract is checked, not only typed.
- **oasdiff skips a major-version change:** breaking the old version is what a new one is for. Nothing is uploaded,
  and oasdiff's review link is off.
- **Tolerant client:** the retry uses `cache: 'reload'` because a wrong-shaped answer comes from an old copy in the HTTP
  cache; if the fresh one is no better, an ordinary error replaces a crash. POST is not repeated.
- **Service worker cache per version:** a new version starts empty and cannot read old shapes.
- **Version usage in metrics:** versions not served are counted as "other", so made-up versions cannot grow the
  metric. A version is removed once next to nobody calls it: for the web a day or two (caches and open tabs), for a
  mobile app months.
- **Rules out of components:** most tests are cheap logic tests because rules live in plain modules, not components.
- **`/api` mocked in e2e:** the server has its own tests, and real Open-Meteo would make runs slow, flaky and spend the
  provider's quota. The service worker is blocked in other specs because it would answer from its cache past the
  mocks.
- **Push not in e2e:** it needs a Firebase project and a deployed build.
- **Daily check of the real providers:** finds a format change before users do. A 429 is skipped, not failed, because
  GitHub's runners share addresses; the run fails only when more than a quarter of the MeteoAlarm feeds fail at once.
- **Shared package boundaries:** server internals and client-specific code (React, hooks, CSS) stay out, so `shared`
  stays usable by a future mobile app.

## Consequences

- Geolocation and offline are now covered by e2e (`geolocation.spec.ts`, `offline.spec.ts`), and the planned live
  check of providers exists (`.github/workflows/providers.yml`).
- axe catches about a third of WCAG problems; screen reader and keyboard checks by hand remain. On its first run it
  found two real problems, both fixed: the country of the highlighted search suggestion had 4.26:1 contrast (soft text
  darkened in light and dark), and the language list scrolled but could not be reached with Tab (now in the Tab order).
- The daily provider check spends about five Open-Meteo calls a day.

## Alternatives considered

- A version in a header (`Accept`): needs `Vary` and makes caching worse.
- A version per endpoint: more to track for no gain at this size.
- No version, additive changes only: works until the first unavoidable break, which is exactly when a version is
  needed.
- Next.js full-stack: simpler deploy, but blurs the client/server boundary.
- Serverless functions: cheap and scalable, but cold starts and no in-memory cache.
- Calling Open-Meteo directly from the browser: fastest to build, but no caching and no provider abstraction.
