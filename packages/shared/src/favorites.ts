import { isValidCoordinates } from './coordinates.js';

/** A saved place. Coordinates identify it; name and country are only for display. */
export interface Favorite {
  latitude: number;
  longitude: number;
  name: string;
  country?: string;
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
  const { latitude, longitude, name, country } = place;
  return [{ latitude, longitude, name, ...(country ? { country } : {}) }, ...favorites];
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
    const { latitude, longitude, name, country } = item as Record<string, unknown>;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') continue;
    if (!isValidCoordinates(latitude, longitude)) continue;
    if (typeof name !== 'string' || !name.trim()) continue;
    const favorite: Favorite = {
      latitude,
      longitude,
      name: name.trim(),
      ...(typeof country === 'string' && country.trim() ? { country: country.trim() } : {}),
    };
    if (!isFavorite(result, favorite)) result.push(favorite);
    if (result.length === MAX_FAVORITES) break;
  }
  return result;
}
