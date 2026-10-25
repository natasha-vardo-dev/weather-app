import { isValidCoordinates, isValidLocationId } from './coordinates.js';

/** A saved place. Coordinates identify it; name and country are only for display. */
export interface Favorite {
  latitude: number;
  longitude: number;
  name: string;
  country?: string;
  /**
   * Provider id of the place, when known (it comes from search). Used only to show the
   * name in the current language; coordinates still identify the place.
   */
  id?: number;
}

/** Each saved city is one forecast request on the start page, so the list stays short. */
export const MAX_FAVORITES = 10;

/** ~1 km, the same rounding as place URLs: one city is never saved twice. */
function key(place: { latitude: number; longitude: number }): string {
  return `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}`;
}

export function isFavorite(favorites: readonly Favorite[], place: Favorite): boolean {
  return favorites.some((f) => key(f) === key(place));
}

/**
 * Adds the place at the top or removes it. Returns a new list (state stays immutable).
 * A full list is returned unchanged: the UI disables saving rather than dropping a city.
 */
export function toggleFavorite(favorites: readonly Favorite[], place: Favorite): Favorite[] {
  if (isFavorite(favorites, place)) return favorites.filter((f) => key(f) !== key(place));
  if (favorites.length >= MAX_FAVORITES) return [...favorites];
  const { latitude, longitude, name, country, id } = place;
  return [
    { latitude, longitude, name, ...(country ? { country } : {}), ...(id ? { id } : {}) },
    ...favorites,
  ];
}

/**
 * Reads favourites from storage. The data is untrusted (edited by hand, older format,
 * another app on the same origin), so invalid entries and duplicates are dropped.
 */
export function parseFavorites(raw: unknown): Favorite[] {
  if (!Array.isArray(raw)) return [];
  const result: Favorite[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const { latitude, longitude, name, country, id } = item as Record<string, unknown>;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') continue;
    if (!isValidCoordinates(latitude, longitude)) continue;
    if (typeof name !== 'string' || !name.trim()) continue;
    const favorite: Favorite = {
      latitude,
      longitude,
      name: name.trim(),
      ...(typeof country === 'string' && country.trim() ? { country: country.trim() } : {}),
      ...(isValidLocationId(id) ? { id } : {}),
    };
    if (!isFavorite(result, favorite)) result.push(favorite);
    if (result.length === MAX_FAVORITES) break;
  }
  return result;
}

/** Same place: coordinates equal after the ~1 km rounding used everywhere. */
export function isSamePlace(a: Favorite, b: Favorite): boolean {
  return key(a) === key(b);
}

/**
 * The home city is one of the saved cities. Anything else (unparsable, not saved any
 * more) means "no home city", so a stale value never shows up.
 */
export function resolveHomeCity(raw: unknown, favorites: readonly Favorite[]): Favorite | null {
  const [candidate] = parseFavorites([raw]);
  if (!candidate) return null;
  return favorites.find((f) => isSamePlace(f, candidate)) ?? null;
}

/** Display order: the home city first, the rest in stored order (newest saved first). */
export function withHomeFirst(favorites: readonly Favorite[], home: Favorite | null): Favorite[] {
  if (!home) return [...favorites];
  return [...favorites.filter((f) => isSamePlace(f, home)), ...favorites.filter((f) => !isSamePlace(f, home))];
}
