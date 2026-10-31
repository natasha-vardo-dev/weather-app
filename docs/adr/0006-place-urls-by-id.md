# 0006. Place URLs identified by GeoNames id

- Status: Accepted (supersedes coordinates and a localised name in the URL)
- Date: 2026-10-31 (recorded)

## Context

Links used to carry coordinates and the place's name in the language it was found in
(`?name=Варшава&country=Польша`): a link from a Russian reader showed Russian names to everyone, and the same city had
a different link in every language. Open-Meteo's place id is the GeoNames id, the same one yr.no uses, so it does not
tie us to the weather provider.

## Decision

- A searched city is `/weather/756135-warsaw`: the id identifies it, the slug is only for people (Latin letters, from
  the English name).
- One link for all languages; the name on screen is fetched by id in the reader's language.
- A link with another or an edited slug opens by id and the page replaces the address with the canonical one, without
  an extra history entry.
- A place without an id (found by location) keeps coordinates and name in the URL: `/weather/52.23,21.01?name=…`.
- Old links (`?name=…&id=…`) open and move to the new form once the id matches the coordinates.

Code: `client/src/locationUrl.ts`, `client/src/placeRoute.ts`, `hooks/usePlaceRoute.ts`.

## Consequences

- A city that is not a favourite waits for one lookup by id before its forecast (cached a day, and by the service
  worker offline).
- An unknown id shows "not found".

## Alternatives considered

- Coordinates in the URL (the first version): a provider-independent key, but no stable identity and no localised name.
- Name-only slugs: ambiguous (many Springfields).
