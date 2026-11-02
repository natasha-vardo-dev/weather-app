# 0022. No Redis while the API runs as one instance

- Status: Accepted (defers the Redis plan of [0003](0003-in-memory-cache.md) and [0018](0018-durable-operational-state.md))
- Date: 2026-11-01

## Context

Redis was in the backlog for two jobs: a second cache level behind the in-memory one ([0003](0003-in-memory-cache.md)),
so a restart or a deploy does not start with an empty cache, and a shared store for the per-IP limits
(`express-rate-limit` and the per-address provider-call allowance, `LoadLimiter`), so several instances count together.

A review on 1 November 2026 weighed what that would buy now:

- **The API is one instance** ([0020](0020-api-on-aws-ec2.md)). Its limits in memory are already exact; a shared
  counter adds nothing until there is a second instance.
- **A cold cache is cheap.** After a restart each place in use is loaded once more: a forecast is 2.2 Open-Meteo calls,
  air quality 1. A call the cache would have saved is at most one per place still within its TTL (15 minutes for
  forecasts, an hour for air quality), so 40 places in use cost about 130 calls, some 1% of the daily 10,000. The budget
  ([0004](0004-provider-limits.md)) still caps it.
- **What must survive a restart already does.** Provider usage, which the budget refuses calls by, and what the notifier
  has sent are in Firestore ([0018](0018-durable-operational-state.md)). Losing per-IP counts on a restart is harmless:
  a client cannot cause a restart, and the windows are a minute and an hour.
- **Redis does not remove the deploy's downtime.** `deploy.sh` restarts the one process, a few seconds without the API;
  only a second instance would cover that.

And what Redis would cost:

- **Hosting.** On the VM it competes for 1 GB of memory with the API and the builds (which already need swap). Hosted
  (Upstash's free tier) it is another provider with its own account, terms, limits on commands, and an entry in the
  privacy policy ([0017](0017-privacy-policy-and-own-font.md)): requests' coordinates would be stored outside our host.
- **A new failure mode.** Every request depends on it: when it is unreachable the API must either serve without limits
  (fail open) or refuse (fail closed), and that needs code, tests and a monitor.
- **Latency.** A cache hit becomes a network round trip instead of a read from memory.

## Decision

No Redis for now. Caches and per-IP limits stay in the process's memory; what must outlive it stays in Firestore.

Revisit when one of these becomes true:

1. **A second API instance**, for deploys without downtime, for availability or for load. Then shared limits are needed
   (each instance would otherwise grant the full allowance) and a shared cache saves each instance loading the same
   places. Redis, or what that host offers, is the step then.
2. **Restarts become costly.** With deploys from `main` automated (backlog), restarts may become frequent. If the
   metrics show cold starts taking a noticeable share of the daily quota (`/api/internal/metrics`, the cache hit rate and
   provider calls right after a deploy; more than about 5% a day), save the cache to disk instead (below) before Redis.

## Consequences

- Nothing to host, pay for or monitor; no change to the privacy policy.
- After every restart the cache is empty: the first visitors of each place wait for the provider
  and the provider calls above are spent again.
- Per-IP counts start from zero after a restart, so an address over its hourly provider-call allowance gets a fresh one.
  Restarts happen on deploys and crashes, not at a client's request.
- The memory cache stays behind `TtlCache.load`/`getOrLoad`, so a second level can still be added without touching the
  routes.

## Alternatives considered

- **Redis now (on the VM or Upstash):** the costs above for a benefit that needs a second instance to exist.
- **Save the cache to disk at shutdown, read it at start:** the server already has about 15 seconds after `SIGTERM` to
  save its state (`shutdown.ts`); a systemd `StateDirectory` would give it a writable place under `ProtectSystem=strict`,
  outside the release directories `deploy.sh` replaces. No new service, nothing leaves the VM. Not done yet: the saving
  is small at today's numbers. The first step if restarts become costly.
- **Firestore as the cache or the limits' store:** it is already there, but a write per cache miss or per request would
  pass the free tier's 20,000 writes a day, and every request would wait for it.
