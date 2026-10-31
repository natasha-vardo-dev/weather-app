# 0014. Browser errors reported to our own endpoint, not Sentry

- Status: Accepted
- Date: 2026-10-31

## Context

A render error used to leave a blank page, and nobody learned about errors in users' browsers. The project avoids
third-party services where it can (privacy policy, accounts, another dependency).

## Decision

- An `ErrorBoundary` around the page content (reset on navigation) shows a translated message and keeps the header
  working; a plain English fallback wraps the whole app in case a provider fails.
- `client/src/errorReporting.ts` sends caught and uncaught React errors, window errors and unhandled rejections to
  `POST /api/v1/client-errors` with `fetch` and `keepalive`. Paths are anonymised (`:place`, no query); each error is
  sent once, at most 5 per page load; browser and extension noise is dropped.
- The server validates the report (`clientErrorSchema`), logs it as `client error` with the user agent and without the
  IP, and limits it to 10 a minute per address.

## Consequences

- No grouping, release tracking or alerts: errors are found by searching Render's logs.
- No third party receives user data.

## Alternatives considered

- Sentry (free plan): grouping and alerts, but another service, account and privacy disclosure. Worth revisiting if
  errors become frequent.
