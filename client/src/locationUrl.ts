import { isValidCoordinates, isValidLocationId } from '@weather/shared';

/** What a weather page needs to know about a place: coordinates plus display info. */
export interface Place {
  latitude: number;
  longitude: number;
  name: string;
  country?: string;
  /** Provider id, if the place came from search: lets the page show the name in any language. */
  id?: number;
}

/** ~1 km precision: enough for weather, and identical URLs for nearby places help caching. */
function round(value: number): string {
  return value.toFixed(2);
}

/**
 * URL for a place, e.g. /weather/52.23,21.01?name=Warsaw&country=Poland
 *
 * Coordinates identify the place, so links keep working if the weather provider
 * (and its location IDs) changes. Name and country are only for display.
 */
export function placePath(place: Omit<Place, 'name'> & { name?: string }): string {
  const params = new URLSearchParams();
  if (place.name) params.set('name', place.name);
  if (place.country) params.set('country', place.country);
  if (place.id) params.set('id', String(place.id));
  const query = params.toString();
  return `/weather/${round(place.latitude)},${round(place.longitude)}${query ? `?${query}` : ''}`;
}

/** Name shown for a link without one: "52.23, 21.01". */
export function coordinatesLabel(latitude: number, longitude: number): string {
  return `${round(latitude)}, ${round(longitude)}`;
}

/** Reads a place from the URL. Returns null for invalid coordinates. */
export function parsePlace(coords: string | undefined, search: URLSearchParams): Place | null {
  const [lat, lon, ...rest] = (coords ?? '').split(',');
  if (rest.length > 0) return null;

  if (!lat?.trim() || !lon?.trim()) return null;
  if (!isValidCoordinates(Number(lat), Number(lon))) return null;

  const latitude = Number(round(Number(lat)));
  const longitude = Number(round(Number(lon)));
  const name = search.get('name')?.trim() || coordinatesLabel(latitude, longitude);
  const country = search.get('country')?.trim() || undefined;
  // Display-only, like the name: an invalid id is ignored rather than breaking the link.
  const rawId = Number(search.get('id'));
  const id = isValidLocationId(rawId) ? rawId : undefined;

  return { latitude, longitude, name, country, ...(id ? { id } : {}) };
}
