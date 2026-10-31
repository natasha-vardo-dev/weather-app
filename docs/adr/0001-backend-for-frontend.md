# 0001. A thin backend for frontend in front of every external API

- Status: Accepted
- Date: 2026-10-31 (recorded; decided at the start of the project)

## Context

The app reads weather, places, air quality and warnings from free services with strict limits (see
[0004](0004-provider-limits.md)). The load on a provider depends on how many different places are asked for, not on
how many people ask. A browser calling providers directly cannot share answers with other browsers, and every
client would depend on the provider's format.

## Decision

The browser talks only to our Express server, which talks to the providers. The server is layered:

- `routes/` — HTTP and validation with the Zod schemas from `@weather/shared`;
- `services/` — logic and caching;
- `providers/` — one adapter per external API behind an interface (`WeatherProvider`, `ReverseGeocoder`,
  `AlertsProvider`, `IpLocator`); the only code that knows a provider's format.

Dependencies are wired in one place (`server/src/index.ts`); tests pass fake providers. Errors reach one handler and
leave as `{ error: { code, message } }` with codes from `shared/src/errors.ts`. The server keeps no state except its
caches.

## Consequences

- One cache for all users protects the providers' limits.
- A provider can be replaced or added by writing an adapter; clients do not change.
- A paid provider's key would stay on the server.
- One more service to host, and a free host that sleeps when idle (see [0005](0005-hosting-same-origin-proxy.md)).

## Alternatives considered

- No server, the browser calls providers: no shared cache, provider format in the client.
- Serverless functions: the same design on other hosting; an in-memory cache would not survive between calls.
- Next.js API routes: ties the backend to the frontend framework.
- GraphQL, an API gateway, a backend-as-a-service: more machinery than a handful of read endpoints need.
