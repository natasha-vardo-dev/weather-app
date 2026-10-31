# 0010. Official warnings from MeteoAlarm, located by region borders

- Status: Accepted
- Date: 2026-10-31 (recorded)

## Context

Official weather warnings matter more than the forecast on a dangerous day. MeteoAlarm (EUMETNET) publishes the
warnings of about 30 European services for free, but has no lookup by coordinates: only a feed per country with region
codes, or polygons for some countries, and the full text (CAP) at a separate link. Its terms require unchanged texts,
attribution and at most 10 minutes of delay.

## Decision

- `GET /api/v1/alerts?lat&lon&lang`. `MeteoAlarmProvider` reads the country feeds (cached 4 minutes, the browser 1
  minute) and the CAP files (an hour).
- Places are matched to regions with MeteoAlarm's official region border file, simplified to about 100 m and shipped
  in `server/data/meteoalarm-regions.json.gz` (built by `server/scripts/buildAlertRegions.ts`). Nine countries without
  region codes use the warning's polygon. A place within 1.5 km of a region counts as in it, 5 km on coasts when
  nothing is nearer: a needless warning is better than a missed one.
- A failed feed fails the request only if it could hold warnings for that place.
- Texts are shown unchanged in the issuer's language closest to the user's, with "Source: EUMETNET – MeteoAlarm".
- If the full text fails to load, the warning is still shown from the feed entry.
- Warnings are not stored by the service worker: an old warning offline is worse than none.

## Consequences

- Warnings only in Europe (not Belarus, Russia and a few others); the next source would be NWS for the US.
- The border file must be rebuilt when MeteoAlarm publishes a new one.
- About 25 MB of memory once the borders are loaded.

## Alternatives considered

- MeteoGate API: also lists by country only, with 50 requests an hour without a key.
- Country rectangles everywhere: too coarse near borders.
