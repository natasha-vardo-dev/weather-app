# 0030. Warning details: coast fallback, neighbour feeds, refresh on an open page, prominent placement

- Status: Accepted
- Date: 2026-11-02

## Context

[ADR 0010](0010-meteoalarm-warnings.md) chose MeteoAlarm warnings located by region borders. The details around it
came from real misses (coastal towns, border towns, pages left open). This record holds them; `docs/architecture.md`
("Weather warnings") describes only how the parts work.

## Decision

- **MeteoAlarm behind its own `AlertsProvider`:** Open-Meteo has no warnings. A separate interface, like the reverse
  geocoder, lets a second source (the US National Weather Service) be another implementation.
- **Locate places ourselves:** no lookup by coordinates exists. Checked on 27 Oct 2026: the newer MeteoGate API only
  lists a whole country (boxes, not shapes, texts behind further links, a 24-hour window on when warnings were sent,
  50 requests an hour without a key).
- **1.5 km tolerance:** places are rounded to ~1 km and borders simplified to ~100 m, and a warning too many beats a
  missed one (Vienna touches several districts; all are Vienna).
- **5 km coast fallback, only when nothing is within 1.5 km:** coasts are drawn coarsely in the borders file. Kos town
  lies 1.7 km beyond the island's outline and Reykjavik 2–3 km; both got no warnings at all (Kos missed the red
  warnings in force on Rhodes, same region). Applying it only as a fallback adds nothing elsewhere. Checked on 15
  seaside towns: the others were already matched. A point truly at sea near a coast gets that coast's warnings.
- **Refresh on an open page every 4 minutes (the server's feed TTL):** warnings used to load only when the place or
  language changed, so a page left open missed new warnings and kept showing ended ones. Asking every minute mostly
  got the same answer, at one request per place shown (ten a minute for a start page with ten favourites) through
  both free hosts. A hidden tab spends no requests; after a failure the next try waits a whole
  interval, not a loop. Components showing the same place share the client cache so they send one request.
- **Drop expired warnings by the clock:** ended warnings disappear without waiting for the next answer, also after a
  failed refresh.
- **Issuer texts unmodified, with `lang` and `dir="auto"`:** MeteoAlarm's terms require unmodified texts; `dir="auto"`
  makes English read correctly in an Arabic interface.
- **A failed neighbour feed fails the request only if it may hold the place's own warnings:** the polygon countries'
  rough boxes overlap their neighbours (Helsinki is inside Norway's box, Dublin inside the UK's, Lublin inside
  Ukraine's); otherwise Norway's outage would hide Helsinki's warnings. The test is "more than 1.5 km inside a region",
  because neither "near" nor plain "inside" was enough: Kreuzlingen (Switzerland) is within 1.5 km of Germany, and
  with rounding and simplification can even land inside Germany, so a failed Swiss feed would have silently left it
  with Germany's warnings only.
- **Untrusted dates:** CAP's `onset` is optional, so the server falls back to other dates. The
  client never formats an unreadable date: `Intl` throws, and a render error would blank the page.
- **No times until the place's time zone is known:** showing them in the reader's zone first would make them jump a
  moment later, "today" included.
- **A separate `/alerts` endpoint:** a warnings outage never touches the forecast.
- **Remember failures for a minute:** while MeteoAlarm is down, requests fail at once instead of each waiting out the
  8-second timeout again.
- **No `Metrics.budget` for MeteoAlarm:** it publishes no limits to count against, and our requests are bounded by the
  caches, not by visitors (each country's feed at most every 4 minutes, each full warning at most hourly), failures
  included. Calls are still counted.
- **Show a warning from the feed summary when its full text fails:** hiding an official warning is worse than showing
  it with an unknown type and an English name.
- **Placement above the city name, in every state:** the most prominent place, chosen knowing its cost: warnings are
  a separate request, so with a cached forecast they arrive 0.1–0.3 s later and the page below moves down.
- **Favourites show only the most severe triangle:** a storm in a saved city is visible without opening it. On tiles,
  only a tile with a warning gives up space. One request per saved city is cheap for the source, since feeds are
  cached per country.
- **All warning types are shown, not only storms:** official warnings for fog, heat or floods matter as much.

## Consequences

- Coastal towns get their region's warnings; a point at sea near a coast gets that coast's.
- Places near a border may show a neighbour region's warnings too.
- An open page shows new warnings within about 4 minutes and drops ended ones on time, at one request per place every
  4 minutes while visible.
- The page jumps slightly when warnings arrive after a cached forecast.
- Warnings show without times until the forecast arrives, and never if it fails.

## Alternatives considered

- **MeteoGate API:** country lists only, with the limits above.
- **Coast fallback everywhere (a flat 5 km):** would add neighbouring regions' warnings to inland places.
- **Refresh every minute:** mostly the same answer at many times the requests.
- **"Near" or plain "inside" for neighbour-feed failures:** both misjudged Kreuzlingen.
- **Times in the reader's time zone until the forecast arrives:** they would jump a moment later.
- **Warnings under the current weather** (the first version): no jump, but at the end of the first phone screen.
- **Inside the current-weather block:** always on the first screen, but the details and hourly strip jump.
- **A detail item like air quality:** no jump, but a red warning looks like humidity.
- **Markers on forecast days:** a warning is an interval, so markers overlap.
- **A badge on the card's corner** for start-page cards: the triangle next to the current temperature was chosen
  instead.
- **Only storm warnings:** other official warnings matter as much.
