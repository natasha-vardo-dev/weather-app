# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private vulnerability reporting:
[Security → Report a vulnerability](https://github.com/natasha-vardo-dev/weather-app/security/advisories/new).
You will get an answer within 7 days; a confirmed problem is fixed and deployed before it is made public, and the
report is credited if you wish. There is no bug bounty: the project is non-commercial.

In scope: the site, the API, the proxy between them (`client/middleware.ts`), the service workers and the deployment
scripts in `deploy/vm`. Out of scope: the data providers (Open-Meteo, MeteoAlarm, Nominatim, ipwho.is), Vercel, AWS
and Firebase themselves; report those to their owners.

## Supported versions

Only the code on `main`, which is what runs at the demo site. There are no older releases to support.

## What is in place

- The API refuses to start in production with a missing or unsafe setting; secrets are rotated as described in
  [docs/operations.md](docs/operations.md#secrets).
- The site sends a Content-Security-Policy, HSTS and the other headers in `client/vercel.json`; the API sends helmet's.
- Provider answers are size-limited and validated before use; URLs taken from provider data are fetched only from an
  allow list ([ADR 0024](docs/adr/0024-server-hardening-observability-privacy.md)).
- Dependabot opens updates weekly and security updates as soon as an advisory is out; CI fails on high or critical
  advisories in production dependencies ([docs/operations.md](docs/operations.md#dependency-audit)).
- Logs hold no IP addresses, coordinates or search terms ([privacy](docs/architecture.md#privacy)).
