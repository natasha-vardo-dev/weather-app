import { CITY_MATCH_KM, distanceKm, isValidCoordinates, isValidLocationId } from './coordinates.js';

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
 * The saved city a found place belongs to, if any: same coordinates, the same provider
 * id, or the same name within CITY_MATCH_KM (the nearest). For the user's location, whose
 * coordinates are their own ~1 km cell, not the city centre a saved city has: without it
 * the page said "Save" for a city already saved, and saving added it a second time.
 * Names are compared as stored, case-insensitively; another language just means no match.
 */
export function findSavedCity(favorites: readonly Favorite[], place: Favorite): Favorite | null {
  const exact = favorites.find((f) => isSamePlace(f, place) || (place.id !== undefined && f.id === place.id));
  if (exact) return exact;
  const name = place.name.trim().toLowerCase();
  let best: { favorite: Favorite; km: number } | null = null;
  for (const favorite of favorites) {
    if (favorite.name.trim().toLowerCase() !== name) continue;
    const km = distanceKm(favorite, place);
    if (km <= CITY_MATCH_KM && (!best || km < best.km)) best = { favorite, km };
  }
  return best?.favorite ?? null;
}
