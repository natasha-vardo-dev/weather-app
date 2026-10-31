# 0007. Favourites stored in the browser, no accounts

- Status: Accepted
- Date: 2026-10-31 (recorded)

## Context

People want a few cities at hand. Accounts would need a database, sessions, password or identity-provider flows and a
privacy burden, none of which fits free hosting or the current size of the project.

## Decision

- Favourites live in `localStorage` (`favorites:v1`), at most 10 (`MAX_FAVORITES`), newest first. A city is identified
  by coordinates rounded to about 1 km, and keeps its GeoNames id when the id is verified.
- Storage is treated as untrusted input (`parseFavorites`). Tabs stay in sync through the `storage` event
  (`useSyncExternalStore`).
- Rules live in `shared/src/favorites.ts`, storage in `client/src/favoritesStore.ts`, the hook only connects them to
  React.
- The home page shows favourite cards; a city page shows a strip of favourites. Their forecasts go in one batch request
  (`/api/v1/forecasts`).

## Consequences

- Favourites do not follow the user to another device.
- When the list is full, a new city is not added and nothing is evicted; a message asks to remove one.
- Moving to accounts later keeps the hook's API: the source becomes the server, and the local list is merged on first
  sign-in.

## Alternatives considered

- Accounts with PostgreSQL: planned only if the project grows.
- A home city and pinned cities: built and removed; a second notion and an extra button on every page for a list of
  ten that is visible anyway.
