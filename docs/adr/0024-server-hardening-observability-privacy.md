# 0024. Observability, privacy and hardening details of the API and site

- Status: Accepted
- Date: 2026-11-02

## Context

The API is one small instance on a VM ([0020](0020-api-on-aws-ec2.md)) with no paid monitoring, behind a Vercel proxy
([0005](0005-hosting-same-origin-proxy.md)), for a European audience under the GDPR
([0017](0017-privacy-policy-and-own-font.md)). It fetches data from several external providers and pushes through
Firebase. This record holds the smaller choices about logs, metrics, health checks, configuration, outbound requests,
provider answers, push limits, shutdown, browser errors and security headers; `architecture.md` (sections
"Observability", "Privacy" and "Reliability and security") describes only how they work.

## Decision

- **Logs without personal data.** The request line leaves out the query (it holds coordinates and search terms) and
  IPs. The health check is not logged because it comes every few seconds.
- **Metrics in memory, logged every 15 minutes.** The `metrics` log line gives a history without a metrics service;
  enough for one small instance. Provider usage alone is persisted ([0018](0018-durable-operational-state.md)), so a restart does not reset the budget.
- **Counting provider calls by wrapping each adapter's `fetch`,** so no adapter changed.
- **A warning at 80% of a limit, and `/api/health/quota` answering 503,** so trouble is seen before the provider starts
  refusing and an uptime monitor can turn it into an alert ([operations.md](../operations.md)). Quota is public like
  health because free monitors cannot send a secret; it tells how busy the providers are, nothing about users.
- **Health does not call the provider.** An Open-Meteo outage is not a reason to restart an instance that still serves
  cached forecasts.
- **Health reports `proxied`.** Health itself stays open, so a plain status check would not notice that the secrets
  differ on Vercel and the VM; the uptime monitor calls it through the site and does.
- **A privacy policy that follows the code.** It describes what the code does, so it changes with it. The service
  worker's cache of the last forecasts and place names is a record of places viewed, so the policy lists it. The
  server calls Open-Meteo and Nominatim as itself, so those never see the user. The log retention (14 days) is set
  explicitly so the policy can state it.
- **A keyed hash of the IP for the location cache** (`ipFingerprint`, random key per process). A plain hash would not
  protect the address: all IPv4 addresses can be hashed.
- **Push tokens are not stored;** only a SHA-256 for an hour, to limit changes per device.
- **Configuration fails closed in production.** An instance that does not start is noticed at once; one serving without
  its proxy check is not (with no secret and `TRUST_PROXY` counting proxies, a forged
  `X-Forwarded-For` got a fresh rate limit per request). Firebase without `ALERTS_NOTIFY_SECRET` is refused because
  devices could subscribe and nothing would ever be sent. No `CORS_ORIGIN` is needed in production: the site calls the
  API through its own origin. Problems are listed all at once, never with a secret's value.
- **An allow list for MeteoAlarm document URLs.** The feeds name the URL of each full warning (CAP), so the server used
  to fetch URLs taken from upstream content: a tampered feed or a redirect could make it request internal addresses
  (server-side request forgery). Every CAP link in the live feeds is on `feeds.meteoalarm.org` (checked 31 October
  2026). The VM's firewall does not restrict outgoing traffic, so this check is the boundary.
- **Provider answers bounded and validated before caching.** Size limits are well above the live answers. Open-Meteo's
  answers used to be cast to their TypeScript interfaces: a missing or shorter array produced a "successful" forecast
  that broke our own contract and replaced a good cached one. Parsing with the API's own schemas makes any such answer a
  `ProviderError`, so stale-if-error serves the last good copy.
- **MeteoAlarm caps and two fetch queues.** A notifier run or a page cannot open unbounded connections and buffers, and
  a page's warning text never waits behind the notifier's read of every feed.
- **Push subscription changes limited in layers.** Each change is a Firebase Admin call per area, and the proxy secret
  proves the proxy, not the visitor, so a script could spend the project's quota. The per-token allowance (120 an hour)
  is sized for a renewed token, which re-subscribes every place with notifications on; the client sends those one by
  one, since a 429 midway would leave the device on a dead token. A token is a capability (whoever has it can change
  its subscriptions), so it is keyed by its SHA-256, never kept as it came. The global budget refuses at 90% like the
  providers' budgets. The budget is checked again when a queued change's turn comes, so a burst cannot overshoot it; a
  double click or retry joins the change under way. Turning notifications off is exempt from the per-token allowance and
  the budget: nothing may keep pushes coming to someone who asked them to stop.
- **Provider usage restored before it is saved.** Saving before the saved counts are read back would wipe them; and a
  restart must not hand out a fresh daily allowance.
- **Graceful shutdown.** Before, the process just died mid-answer on every deploy and reboot. 10 s for requests under
  way fits inside systemd's 30 s.
- **Error boundaries at two levels.** A render error no longer leaves a blank screen and the header keeps working. The
  outer boundary's message is plain English because the providers themselves may be what failed.
- **Browser errors to our own endpoint, not Sentry** ([0014](0014-client-error-reporting.md)):
  nothing leaves our hosts. The path has places replaced because a link to a place without an id holds its coordinates.
- **Security headers in one file, also served by `vite preview`,** so the end-to-end tests run under the real policy;
  failing on any console error makes every scenario check the policy.

## Consequences

- Metrics other than provider usage are lost on restart; there is no dashboard or history beyond the logs.
- Browser errors have no grouping or alerting.
- Push cannot be exercised under the policy in a test (no notification permission in automation): turning
  notifications on and off must be checked after each deploy.
- Per-IP rate limits are per instance: during a deploy's overlap each instance counts on its own.
- A policy text in English only; readers of other languages get an English legal text
  ([0017](0017-privacy-policy-and-own-font.md)).

## Alternatives considered

- **Prometheus format (`prom-client`) scraped by Grafana Cloud, or OpenTelemetry:** the next step with several
  instances or alerting; not needed for one instance.
- **A health check that calls the provider:** a provider outage would restart a healthy instance.
- **A quota endpoint behind a secret:** free uptime monitors cannot send one.
- **A plain hash of the IP:** reversible by hashing every IPv4 address.
- **Failing open on unsafe production settings:** an instance without its proxy check is not noticed.
- **Fetching any URL a feed names, following redirects:** server-side request forgery.
- **Casting provider answers to TypeScript interfaces:** a broken answer replaces a good cached one.
- **Sentry or another error-tracking service:** data leaves our hosts ([0014](0014-client-error-reporting.md)).
- **Translating the policy into all languages, keeping Google Fonts:** see [0017](0017-privacy-policy-and-own-font.md);
  a German court found Google Fonts against the GDPR in 2022 (LG München I, 3 O 17493/20).
