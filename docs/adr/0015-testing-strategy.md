# 0015. Tests against fakes; end-to-end on the production build

- Status: Accepted
- Date: 2026-10-31 (recorded)

## Context

The app depends on external services with limits; tests that call them would be slow, flaky and spend the quota. The
production build differs from the dev server (service worker, security headers, minification).

## Decision

- Logic: Vitest in Node, for `shared`, the server (with fake providers and Supertest) and plain client functions.
- Components: Testing Library in jsdom, a separate Vitest project; `renderWithApp` supplies the providers.
- End to end: Playwright on the production build (`vite build` + `vite preview`) in Chromium at desktop and phone
  sizes. `/api` is mocked in the browser (`client/e2e/mockApi.ts`) with the same fixtures as component tests, built
  from the place's current time. A request missing from the mock or any console error fails the test, so CSP
  violations fail it too. The service worker is blocked so it cannot answer around the mock.
- Accessibility: axe (WCAG 2.1 A and AA) in every important state.
- CI: audit of production dependencies, format, OpenAPI check, lint, types, tests, build, e2e; also weekly without
  changes, since advisories and dates change on their own.

## Consequences

- Fast, stable runs; the real server and providers are not exercised end to end.
- Not covered by e2e: geolocation, offline and the service worker, push notifications.
- Firebase is faked everywhere: SDK updates need a live check (see [0011](0011-push-via-fcm-topics.md)).

## Alternatives considered

- E2E against the real server and Open-Meteo: slow, flaky, spends the limit. A scheduled live check of the providers'
  formats is planned instead.
