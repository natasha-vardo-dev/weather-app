# @weather/shared

The contract between the API and every client, and the logic both sides share: types, Zod schemas (server and tests
only), error codes, `API_PREFIX`, the API client (`createApiClient`), limits and defaults, weather, place and language
helpers.

Runs unchanged in Node.js, browsers and React Native: no Node APIs, DOM, Express or bundler features. Built to `dist`
by `npm run build:shared` (the root's `pre*` scripts do it before `dev`, `test` and `typecheck`).

- A field added to an answer goes into `src/responseSchemas.ts` and `src/types.ts` (a compile-time check keeps them
  equal), then `npm run openapi` regenerates `docs/openapi.json`.
- Rules: [CONTRIBUTING.md](../../CONTRIBUTING.md#rules-that-are-easy-to-miss); why it exists:
  [ADR 0002](../../docs/adr/0002-monorepo-shared-contract.md), details [ADR 0031](../../docs/adr/0031-api-testing-and-shared-package-details.md).
