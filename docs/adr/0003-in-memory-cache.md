# 0003. In-memory cache-aside with request coalescing and stale data

- Status: Accepted
- Date: 2026-10-31 (recorded; refined several times, see [architecture.md](../architecture.md#caching))

## Context

The provider's daily limit, not our server, is the bottleneck. Many users ask for the same few places, often at the
same moment (a batch of favourites, the burst after a restart). A provider outage should not turn into errors for
places we have seen recently.

## Decision

`TtlCache` (`server/src/services/cache.ts`), one per kind of data, in the memory of the process:

- cache-aside through `getOrLoad`; concurrent requests for one key share one provider call;
- the key contains everything that affects the answer: coordinates rounded to 2 decimals (about 1 km), and the
  provider is asked for that rounded point, so an entry does not depend on who filled it;
- TTLs follow the sources: forecast 15 minutes, air quality 60, searches 24 hours;
- two stale windows, like HTTP `stale-while-revalidate` and `stale-if-error`: just past the TTL the old value is
  returned at once and refreshed in the background; later a request waits for the provider and gets the old value only
  if the provider fails;
- errors are never cached, empty search results are;
- a budget in bytes per cache with least-recently-used eviction, and up to 10% TTL jitter that only shortens;
- `Cache-Control` is set only after a successful answer; the error handler always sends `no-store`.

## Consequences

- One provider call per place per TTL, whatever the number of users.
- The cache is lost on every restart, deploy and sleep of the free host, and is not shared between instances.

## Alternatives considered

- Redis (Upstash or Render Key Value): survives restarts and is shared; needs another account. Planned as a second
  level behind the same `getOrLoad`.
- One stale window of an hour: a rarely visited city got an hour-old forecast on almost every visit.
- Count-based limits with first-in-first-out eviction (the first version): a popular city was evicted before a rare one.
