# 0023. Cache details and layered protection of the provider's limits

- Status: Accepted (refines [0003](0003-in-memory-cache.md) and [0004](0004-provider-limits.md))
- Date: 2026-11-02

## Context

[0003](0003-in-memory-cache.md) chose an in-memory cache with coalescing and stale data; [0004](0004-provider-limits.md)
made the free providers' limits requirements. Open-Meteo's free tier (600 calls a minute, 5,000 an hour, 10,000 a day,
per server IP) is the bottleneck, not our server. Many smaller choices followed, each refined after use and reviews
(roborev, the production review). This ADR records, after the fact, the reasoning that used to live in
`architecture.md` (sections "Caching" and "Protecting the provider's limits"), which now describes only how it works.

## Decision

- **~1 km keys, and the provider asked for the key's point.** Rounding to 2 decimals lets nearby requests share an
  entry. The provider is asked for the rounded point, not for whoever asked first, so everyone in a cell gets the same
  answer whichever request filled the cache.
- **`days` maps to two entries (10 and 16 days).** Open-Meteo counts up to two weeks as one period, so 10 days cost no
  more than 3. Before, every `days` value was an entry and provider calls of its own, and a client varying `days`
  multiplied both.
- **Yesterday and the next 24 hours in the same call** (`past_days=1`, `forecast_hours=24`): still one provider call
  per place. Yesterday is one line under the current weather rather than a row in the forecast list, which stays
  forward-looking.
- **Air quality is its own endpoint and cache.** It is another Open-Meteo API on another host; separate from
  `/forecast`, the forecast never fails or waits because of it. TTL an hour because the provider updates it hourly; at
  most 24 calls a place a day (forecast: up to 96, at 2.2 calls each).
- **A 10-second timeout for air quality.** This API is slower: a 5-second timeout was seen to fire on a cache miss
  (right after a restart). It loads apart from the forecast, so waiting holds nothing up.
- **One client retry after 20 seconds.** Most provider hiccups are short; without it the item stayed hidden until the
  city was reopened. One retry, not a backoff loop: it is secondary data, and every retry spends the provider's limit.
- **The air-quality index is chosen in `shared`.** It is a presentation choice; the API returns both raw values, so
  another client can choose differently. The level is always written out, so colour is not the only signal. Pollutants
  have no colour because the two indices use different thresholds. Without pollutant data the value is not a button, so
  it never opens an empty box.
- **Byte budgets, LRU.** A popular city is not evicted before a rare one just because it was stored earlier. Measured
  as JSON size, so the real memory use is roughly 2–3 times the budget.
- **TTL jitter, shortening only.** Entries stored together (a batch of favourites, the burst after a restart) do not
  all expire, and call the provider, in the same second. Jitter only shortens because a TTL can be a promise to a source
  (MeteoAlarm's 10-minute delay limit).
- **Two stale windows.** The short `stale-while-revalidate` window means nobody waits for the provider on a popular
  entry. The long `stale-if-error` window means a provider outage shows a slightly older forecast instead of an error,
  while on a normal day a rarely opened city is not shown old. A stale answer has `max-age=60` so browsers ask again
  soon, not `no-store`, so the service worker still keeps it for offline. MeteoAlarm has no stale windows: an old
  warning is worse than none, and its terms limit the delay.
- **One provider call per key at a time** (`getOrLoad`). Ten people opening one city in the same second, or a popular
  entry expiring under load (a cache stampede), are one call to Open-Meteo, not ten. Checked against the real API: ten
  parallel requests for Warsaw, one provider call.
- **The page says when a forecast is old, from the data's own time.** Fresh data is up to ~40 minutes behind (the
  provider's current weather is per 15 minutes, plus the server's 15 and the browser's caches), so more than 60 means the
  provider was down and the server answered with what it had, or the page stayed open out of view (it refreshes when it
  comes back into view). Judging by the data's time needs nothing from the API and covers both cases; hence the neutral
  wording "last updated" rather than "couldn't update". The shared style has white text at 7:1 in the light theme.
- **Batch forecasts.** The start page with ten saved cities made ten requests; now one. Provider calls are the same
  (each place uses the `/forecast` cache); the gain is requests to our API and its rate limit, and round trips on a
  phone. One failing place does not fail the others.
- **The city page's own forecast never joins a batch.** In a batch it would wait for the slowest saved city, and the
  service worker would keep it only inside that batch, not as the city's own copy for offline use (found by roborev).
- **The service worker splits batches into per-city copies.** Offline, a saved city seen only as a card must still
  open. The copies are written outside Workbox's expiration bookkeeping, so the same function cleans them up (found by
  roborev). Unit-tested against the API client's own URLs; checked in a production build: a city opened offline from
  its card shows its forecast with the offline banner.
- **Fallback to single requests.** Client and server deploy separately, so the batch endpoint may be missing. On a
  network failure the service worker has a batch only under its exact list of places, which changes with the
  favourites (or the city page went out with the strip), but may have each city's own `/forecast`.
- **Partial batches are `no-store`, and the service worker honours it,** so one failed city does not replace the last
  complete copy (found by roborev).
- **Per-IP request limits, generous on purpose.** They stop scripts, not people; an office or a VPN puts many people
  behind one address. Search is 60 because a long tail of queries misses the cache, so search spends quota fastest;
  `/places/*` is 10 because Nominatim allows one call a second for the whole server.
- **Batches limited by places** (30 × 10 = 300, as many as single forecasts). Under the general limit alone a script
  sending batches of new places could cause ten times as many provider calls (found by roborev). Worst case one address
  reaches 600 places a minute, the provider's minute limit for the whole server; per-IP limits cannot protect that
  against many addresses anyway, which is what the cache, the budget and the 80% warning are for.
- **The client address comes from the proxy, proven by a secret** ([0005](0005-hosting-same-origin-proxy.md)).
  Trusting `X-Forwarded-For` from anyone would let a client claim a new address per request. Trusting only the proxies
  in front (`TRUST_PROXY`) was not enough (found by roborev): the API host is public (Render then, the VM now), and a
  direct call with a forged `X-Forwarded-For` was passed on by the host's proxy. Vercel sets `x-real-ip` and overwrites
  `x-forwarded-for`, so a client cannot fake the address there; `X-Client-IP` with the secret replaces counting proxies
  in `X-Forwarded-For`, whose handling on a forwarded request Vercel does not document. The middleware uses `rewrite`,
  so Vercel's router proxies: a `fetch` of its own would hold each request, and the Edge runtime gives up after about
  25 s, less than a free Render instance took to wake (found by roborev). Health and `/internal/*` stay open because
  monitors and the scheduler call them directly. Without the variable nothing changes until it is set on both sides.
- **Provider calls per address** (`LoadLimiter`). Request limits count requests, not their cost: within them one address
  could ask for ~300 new places a minute (coordinates a hundredth of a degree apart all miss the cache) and spend the
  shared daily quota in about a quarter of an hour, after which the budget refuses new forecasts to every user. 30 a
  minute fits a cold start page with ten saved cities with room to spare; at 150 an hour one address all day stays under
  the daily budget. Counting only provider calls means cached answers cost nothing. IPv6 per /56, as in
  `express-rate-limit`; the 50,000-address cap keeps memory bounded, and against that many addresses the budget holds.
  Two simultaneous requests for one new place share a load and so a refusal: rare, and only for someone sharing a place
  with a requester over the limit.
- **Empty coordinates are 400.** `z.coerce.number()` alone read them as 0, a place in the Gulf of Guinea, a provider
  call each.
- **A server-wide budget in Open-Meteo's own units.** A request with more than 10 variables or 2 weeks counts as several
  calls (Open-Meteo's pricing FAQ); counted per request, the budget would have allowed more than twice the limit (found
  by roborev). Per-IP limits stop one address, not many or a crowd of real users. Refusing at 90% leaves 10% for calls
  already under way. `503 SERVICE_BUSY`, not `RATE_LIMITED`, whose text blames the user's network. ipwho.is gets a cap
  of our own because it only asks for "low traffic"; Nominatim's queue already enforces its limit.
- **Fewer forecast variables.** "Now" no longer asks again for what the hourly data has (humidity, wind and gusts are
  the current hour's, day or night comes from today's sunrise and sunset): 22 variables and 2.2 calls instead of 26 and
  2.6. With the TTLs above (15 minutes and an hour), the budget covers ~38 places kept fresh all day, up from 21 (10
  and 30 minutes, 2.6 a forecast).

## Consequences

- A forecast for 11 to 13 days is cut from the 16-day one, which Open-Meteo counts as about 2.7 calls instead of 2.2;
  accepted: the client asks for 10, and a third cache entry per place for a range nobody uses is not worth it. The
  hourly data does not grow with `days`: it is always the next 24 hours (`forecast_hours`).
- Right after the hour changes, the first "Now" slot may still be the previous hour for a few minutes; accepted to keep
  provider usage flat.
- In steep terrain the cell's point may differ in elevation from the city's (Open-Meteo corrects temperature for
  elevation): the price of sharing entries.
- One more provider call per place for air quality.
- While the budget is spent, places nobody has asked about recently do not open, for anyone.
- A refusal of a new place by `LoadLimiter` reaches whoever joined the same load.
- The cache is per instance and starts empty after a restart ([0022](0022-no-redis-while-one-instance.md)): a cold
  cache costs about 1% of the daily quota per restart; saving the cache to disk at shutdown is the cheaper first step if
  restarts become costly.
- Per-IP counts are per instance; with several, a Redis store would share them ([0022](0022-no-redis-while-one-instance.md)).

## Alternatives considered

- **Restricting `days` to 10:** within `/api/v1` refusing values it accepted is a breaking change
  ([0012](0012-api-versioning.md)).
- **An entry per `days` value:** the previous design; multiplies entries and provider calls.
- **Air quality inside `/forecast`:** the forecast would fail or wait when air quality does.
- **A backoff loop of retries for air quality:** secondary data, and every retry spends the provider's limit.
- **An "Air quality: unavailable" line with its own retry button:** tells a failure apart from "no data for this
  place", at the price of one more UI state and its translations.
- **A count of entries, first in first out:** the previous limit (500 entries per cache) ignored entry size and evicted
  popular entries by age.
- **One long stale window (an hour) for both purposes:** the first version; with little traffic it answered almost every
  visit to a rare city with an old forecast, refreshing it for a next visitor who might come only after it was old
  again.
- **The old offline banner's 15% white fill for the notices:** 4.2:1 for white text, below WCAG AA.
- **`no-store` on stale answers:** the service worker would not keep them for offline.
- **Asking the provider for whichever point came first:** answers in a cell would depend on who filled the cache.
- **Asking Open-Meteo for several places in one call** (it accepts lists of coordinates): fewer HTTP calls, but not
  clearly less quota (heavier requests count as several calls; to be checked against its terms), and the cache would
  have to split a call's answer between places.
- **Batching the city page's own forecast:** waits for the slowest city and leaves no per-city offline copy.
- **Plain `rewrites` in `vercel.json`:** cannot add request headers.
- **Trusting `X-Forwarded-For` (all, or a fixed number of proxies):** forgeable on a public API host.
- **Limiting only requests, not provider calls:** one address could spend the daily quota for everyone.
- **Counting the budget per request:** more than twice the real limit.
- **Redis for caches and counters now, or Firestore as their store:** see [0022](0022-no-redis-while-one-instance.md).
