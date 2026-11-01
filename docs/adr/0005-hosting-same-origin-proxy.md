# 0005. Vercel and Render, one origin through a proxy with a secret

- Status: Accepted; the Render part superseded by [0019](0019-api-on-oracle-free-vm.md) (the proxy with a secret stays)
- Date: 2026-10-31 (recorded)

## Context

Hosting must be free. Free Render sleeps when idle and takes up to a minute to wake. Rate limits by address need the
real client address. Render's address is public, so a request sent to it directly with a forged `X-Forwarded-For`
would bypass the limits.

## Decision

- The site on Vercel, the API on Render. `/api/*` on the site is forwarded to Render by Vercel Routing Middleware
  (`client/middleware.ts`) using Vercel's `rewrite`, so the router forwards and the middleware does not hold the
  request while Render wakes.
- The middleware adds `X-Proxy-Secret` (`PROXY_SECRET`, same value on both hosts) and `X-Client-IP`, and drops those
  headers if the client sent them. With `PROXY_SECRET` set the server answers 404 to requests without it (except
  `/api/health` and `/api/internal/*`) and takes `X-Client-IP` as the address only together with the secret.
- One origin for the site and the API: no CORS, and future session cookies are first-party (Safari blocks third-party
  ones). In development the Vite proxy does the same.
- An external scheduler calls the server every 5 minutes (it also runs warning notifications), which keeps it awake.

## Consequences

- Without the variables (locally, in tests) everything is allowed, as before.
- The middleware runs only on Vercel; it is covered by unit tests and was checked live on 2026-11-01.
- Keeping Render awake uses almost all of its free monthly hours, leaving none for a second service.

## Alternatives considered

- Allowing only Vercel's addresses on Render: free Vercel has no fixed outgoing addresses, free Render has no allow
  list.
- Trusting one proxy hop only: every user would get Vercel's address and share one limit.
- `rewrites` in `vercel.json`: cannot add request headers.
