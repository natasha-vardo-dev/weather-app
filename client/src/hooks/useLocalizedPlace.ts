import {
  ApiError,
  ERROR_CODES,
  isSamePlace,
  SEARCH_MAX_LENGTH,
  SEARCH_MIN_LENGTH,
  type Favorite,
  type Location,
} from '@weather/shared';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { createQueryCache } from '../api/queryCache';
import { coordinatesLabel } from '../locationUrl';
import { useI18n } from '../i18n/I18nProvider';

export interface PlaceName {
  name: string;
  country?: string;
}

/** Place names barely change: one day, like the API's Cache-Control for /locations/:id. */
const namesCache = createQueryCache<PlaceName | null>({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 200 });

/**
 * Finds the place's names in `language`:
 * - with a provider id (places opened from search): a lookup by id;
 * - without one (cities saved before ids were stored, or hand-made links): a search by the
 *   stored name. Works when the stored name is in a script the provider matches in that
 *   language (English names always match).
 * Either way the result must be at the place's coordinates: the id comes from the URL, so a
 * wrong one (an edited link) would otherwise put another city's name over this weather.
 * Nothing is searched for a name no search can match or the API would reject: a link
 * without a name (coordinates as the name), or a name too short or long for the search
 * ("Å" in Norway). A rejected search would fail every time and, not being cached, repeat.
 * An unknown id (404) is an answer, not a failure: it returns null, so the cache keeps it
 * and tiles with a stale id don't ask again on every city change. Network and server
 * errors still reject and are retried next time.
 */
function isSearchable(place: Favorite): boolean {
  const name = place.name.trim();
  return (
    name.length >= SEARCH_MIN_LENGTH &&
    name.length <= SEARCH_MAX_LENGTH &&
    place.name !== coordinatesLabel(place.latitude, place.longitude)
  );
}

export async function loadNames(place: Favorite, language: string): Promise<PlaceName | null> {
  let location: Location | undefined;
  if (place.id) {
    try {
      location = await api.getLocation(place.id, { language });
    } catch (err) {
      if (err instanceof ApiError && err.code === ERROR_CODES.NOT_FOUND) return null;
      throw err;
    }
  } else if (isSearchable(place)) {
    const results = await api.searchLocations(place.name, { language });
    location = results.find((r) => isSamePlace(r, place));
  }
  if (!location || !isSamePlace(location, place)) return null;
  return { name: location.name, country: location.country || undefined };
}

/**
 * Coordinates are part of every key: loadNames checks the result against them, so a cached
 * result is only valid for the same place. Keyed by id alone, a link pairing that id with
 * other coordinates would reuse a check made for the real place, skipping it.
 */
function cacheKey(place: Favorite, language: string): string {
  const coords = `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}`;
  return place.id ? `${language}:id:${place.id}:${coords}` : `${language}:name:${place.name}:${coords}`;
}

/**
 * The place to save: with its id only if the id is confirmed to be this place. The id comes
 * from the URL (untrusted, e.g. an edited link), and a saved wrong id would stay in the
 * favourites. Reuses the names lookup the page already started (same cache key), so it
 * usually resolves at once; while it is still running, saving waits for it. Unconfirmed
 * (another place, unknown, or the lookup failed): saved without an id, and its names
 * are then found by a search, like favourites saved before ids existed.
 */
export async function withVerifiedId(place: Favorite, language: string): Promise<Favorite> {
  if (!place.id) return place;
  const { id: _unverified, ...withoutId } = place;
  try {
    const names = await namesCache.load(cacheKey(place, language), () => loadNames(place, language));
    return names ? place : withoutId;
  } catch {
    return withoutId;
  }
}

/**
 * The place's name and country in the current UI language. Names are stored in the
 * language they were searched in, so a city saved in English would otherwise stay
 * "Warsaw" in a Russian UI. Falls back to the stored names while loading or on failure.
 */
export function useLocalizedPlace(place: Favorite): PlaceName;
export function useLocalizedPlace(place: Favorite | null): PlaceName | null;
export function useLocalizedPlace(place: Favorite | null): PlaceName | null {
  const { language } = useI18n();
  // null (an invalid link) still calls the hook, so hooks keep their order.
  const key = place ? cacheKey(place, language) : null;
  const [state, setState] = useState<{ key: string; names: PlaceName | null } | null>(null);

  useEffect(() => {
    if (!key || !place) return;
    let cancelled = false;
    namesCache
      .load(key, () => loadNames(place, language))
      .then((names) => {
        if (!cancelled) setState({ key, names });
      })
      .catch(() => {
        // Keep the stored names: a translation is nice to have, not worth an error.
      });
    return () => {
      cancelled = true;
    };
    // `key` covers everything loadNames depends on.
  }, [key]);

  if (!key || !place) return null;
  const names = state?.key === key ? state.names : namesCache.get(key);
  return names ?? { name: place.name, country: place.country };
}
