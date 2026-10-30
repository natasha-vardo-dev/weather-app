import { isSamePlace, type ErrorCode, type Favorite, type Location } from '@weather/shared';
import { placePath, roundedPlace, slugify, type Place, type PlaceRoute } from './locationUrl';

export type RouteState =
  | { status: 'invalid' }
  /** Waiting for the place behind an id. */
  | { status: 'loading' }
  | { status: 'not-found' }
  /** The lookup failed and nothing about the place is known yet; `code` says why (offline…). */
  | { status: 'error'; code: ErrorCode }
  | { status: 'ready'; place: Place };

export interface RouteLookups {
  favorites: readonly Favorite[];
  /** The id looked up in the interface language: Location, null for an unknown id, undefined if not loaded. */
  local: Location | null | undefined;
  /** The same in English, for the slug. */
  english: Location | null | undefined;
  /** The place this id resolved to before (another language, say), while a new lookup runs. */
  previous: Place | undefined;
  /** Why the latest lookup failed, or null. */
  failed: ErrorCode | null;
}

function toPlace(location: Location): Place {
  return roundedPlace({
    latitude: location.latitude,
    longitude: location.longitude,
    name: location.name,
    country: location.country || undefined,
    id: location.id,
  });
}

/** The canonical link: the id and the English name as the slug, one address for every reader. */
function canonicalPath(id: number, english: Location): string {
  return placePath({ latitude: english.latitude, longitude: english.longitude, id, name: slugify(english.name) });
}

/**
 * The place a /weather/… link points at, and the link it should have. Plain function: the
 * hook only feeds it the favourites and the lookups by id.
 *
 * - /weather/756135-warsaw: a saved city is there at once (coordinates from the favourites).
 *   Otherwise the coordinates come from any lookup of the id that has succeeded, in any
 *   language: switching the language must not take the forecast away while the new
 *   language's lookup runs, or fails offline. Loading or an error only when nothing about
 *   the id is known yet; the name in the interface language is the page's own business.
 * - /weather/52.23,21.01?name=…: ready at once. An older link with ?id= moves to the id form
 *   once the lookup confirms the id is at these coordinates (an edited link keeps them).
 *
 * `canonical`: the id with the English slug, so links made in another language
 * ("756135-varshava") or edited by hand end up as one address. Null until it is known.
 */
export function resolveRoute(
  route: PlaceRoute | null,
  { favorites, local, english, previous, failed }: RouteLookups,
): { state: RouteState; canonical: string | null } {
  if (!route) return { state: { status: 'invalid' }, canonical: null };

  if (route.kind === 'coords') {
    const { place } = route;
    const known = local ?? english;
    const confirmed = known && english && place.id === known.id && isSamePlace(known, place);
    return { state: { status: 'ready', place }, canonical: confirmed ? canonicalPath(known.id, english) : null };
  }

  const canonical = english ? canonicalPath(route.id, english) : null;
  const saved = favorites.find((f) => f.id === route.id);
  if (saved) return { state: { status: 'ready', place: roundedPlace({ ...saved, id: route.id }) }, canonical };
  const known = local ?? english;
  if (known) return { state: { status: 'ready', place: toPlace(known) }, canonical };
  if (local === null || english === null) return { state: { status: 'not-found' }, canonical: null };
  if (previous && previous.id === route.id) return { state: { status: 'ready', place: previous }, canonical };
  return { state: failed ? { status: 'error', code: failed } : { status: 'loading' }, canonical: null };
}
