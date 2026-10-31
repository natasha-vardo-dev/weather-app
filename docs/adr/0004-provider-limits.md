# 0004. Free providers' limits are product requirements

- Status: Accepted
- Date: 2026-10-31 (recorded)

## Context

The project uses only free data sources and is non-commercial, because free Open-Meteo allows only non-commercial use.
Their terms bind the product:

- Open-Meteo: 600 calls a minute, 5,000 an hour, 10,000 a day, 300,000 a month; a heavy request counts as several
  calls (variables / 10 × days / 14), our forecast is 2.2;
- Nominatim: one request a second, an identifying `User-Agent`, attribution, no bulk use;
- ipwho.is: "low traffic";
- MeteoAlarm: texts unchanged, attribution, at most 10 minutes of delay.

At a 15-minute TTL one place kept fresh all day costs about 235 Open-Meteo calls, so the daily budget keeps about 38
places fresh.

## Decision

- Ask the provider for less: only the variables the page shows; "now" values taken from the current hour.
- Cache (see [0003](0003-in-memory-cache.md)).
- A server-wide budget (`Metrics.budget`): at 90% of any Open-Meteo or ipwho.is window new calls are refused and the
  user gets cached data or `503 SERVICE_BUSY`. Calls are weighted the way the provider counts them and counted when
  sent.
- Per-address rate limits (`server/src/rateLimits.ts`): all of `/api` 300 a minute, batches 30, search 60, places 10.
- Nominatim requests are queued at one a second; a request that would wait more than 3 seconds fails at once.
- Metrics and a log warning at 80% of a limit.

Growing past these limits means another source or a paid plan, never working around a limit.

## Consequences

- While the budget is spent, places not in the cache do not open, for anyone.
- Shared hosting addresses may reach Open-Meteo's per-address limit sooner than our own count says; to check after
  deploy.

## Alternatives considered

- Several places in one Open-Meteo call: unclear gain (heavy requests count as several calls) and the cache would have
  to be split per place.
- A second forecast source (for example MET Norway) behind `WeatherProvider`: not done yet; the way to lift the limit.
