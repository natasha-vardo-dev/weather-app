# 0012. Versioned API with a checked contract

- Status: Accepted
- Date: 2026-10-31

## Context

The site and the API deploy separately, browsers and the service worker keep old responses, and a mobile app may
follow. When the reverse geocoding response changed shape, an old response in Chrome's HTTP cache crashed the page;
the fix was to move the endpoint.

## Decision

- The contract lives under `/api/v1` (`API_PREFIX`); `/api/health` and `/api/internal/*` are not versioned. The
  version is in the path, not a header: the path is the key of every cache, and `Vary` would weaken caching.
- Within a version only compatible changes: an optional field, a new endpoint, a new error code. Removing, renaming,
  changing a type or making a field required needs a new version.
- Response schemas in `shared/src/responseSchemas.ts` are checked at compile time against the interfaces in
  `types.ts`; `server/tests/contract.test.ts` checks every endpoint.
- `docs/openapi.json` is generated (`npm run openapi`); CI checks it is current and compares it with the target branch
  using oasdiff, failing on breaking changes within one version.
- The client tolerates a wrong shape: one retry bypassing the cache, then an ordinary error instead of a crash.
- A breaking version: the server serves both, the client moves, the old one is removed when metrics (`apiVersions`)
  show it is barely used.

## Consequences

- More generated and checked files; the oasdiff step has not run yet (no pull request since it was added).

## Alternatives considered

- Version in the `Accept` header, a version per endpoint, no versions with additions only.
