# 0002. One repository with a shared contract package

- Status: Accepted
- Date: 2026-10-31 (recorded; decided at the start of the project)

## Context

The client and the server change together: most features touch the API, the server and the page in one go. A
mismatch between them should fail at compile time, not in a user's browser. A mobile app (React Native) may come
later and should reuse the same logic.

## Decision

npm workspaces: `packages/shared` (`@weather/shared`), `server`, `client`. The shared package holds the API types,
error codes, Zod schemas, limits and constants, pure weather and language functions, and the API client.

Rules for `shared`:

- it runs unchanged in Node, the browser and React Native: no Node APIs, DOM, Express or bundler features;
- server internals (provider interfaces, provider response types, the cache) stay out of it;
- it is built to `dist` and both sides import the build;
- the client does not import the Zod schemas (they would add zod to the bundle, about 12 KB gzipped); it uses plain
  functions such as `isValidCoordinates`.

## Consequences

- One pull request for a change across the stack; incompatibilities show up in `npm run typecheck`.
- `shared` must be built before the other packages (the `pre*` scripts do it).

## Alternatives considered

- Separate repositories: worth it only when different teams own the parts.
- pnpm with Turborepo: faster at a larger size; not needed for three packages.
