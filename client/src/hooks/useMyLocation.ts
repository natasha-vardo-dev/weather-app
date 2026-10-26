import {
  ApiError,
  ERROR_CODES,
  findSavedCity,
  isValidCoordinates,
  isValidLocationId,
  type Favorite,
  type ReversePlace,
} from '@weather/shared';
import { useCallback, useRef, useState } from 'react';
import { api } from '../api/client';
import { createQueryCache } from '../api/queryCache';
import { getSnapshot } from '../favoritesStore';
import { getCurrentPosition, rememberPosition, type Coordinates, type LocationError } from '../geolocation';
import { useI18n } from '../i18n/I18nProvider';
import type { Place } from '../locationUrl';

/**
 * Places for coordinates barely change: a day, like the API's Cache-Control. Kept only when
 * final: a matched city (it has an id) or "no place here" (null). An answer without an id
 * may be the server's fallback after a failed city search, sent with no-store; kept, it
 * would open the bare position on every click until the tab is closed.
 */
const placesCache = createQueryCache<ReversePlace | null>({
  ttlMs: 24 * 60 * 60 * 1000,
  maxEntries: 50,
  keep: (place) => place === null || place.id !== undefined,
});

/** How long the search waits for a name before opening the forecast without one. */
const NAME_WAIT_MS = 4000;

/**
 * The place at a position, named in `language`; null where there is none (404 is cached
 * too). Usually the city itself, with its coordinates and id, as search would find it.
 */
export function reversePlace(position: Coordinates, language: string): Promise<ReversePlace | null> {
  const key = `${language}:${position.latitude},${position.longitude}`;
  return placesCache.load(key, async () => {
    try {
      return await api.reverseGeocode(position.latitude, position.longitude, { language });
    } catch (err) {
      if (err instanceof ApiError && err.code === ERROR_CODES.NOT_FOUND) return null;
      throw err;
    }
  });
}

export type FoundPlace = Omit<Place, 'name'> & { name?: string };

/**
 * The place to open from the server's answer, checked rather than trusted: a response can
 * be older than the code (an HTTP-cached answer from before /api/reverse returned
 * coordinates had only a name, and the page crashed on the missing coordinates). Without
 * valid city coordinates: the position itself, keeping the name if there is one.
 */
export function toFoundPlace(found: ReversePlace | null, position: Coordinates): FoundPlace {
  if (!found || typeof found.name !== 'string' || !found.name) return position;
  const city = isValidCoordinates(found.latitude, found.longitude);
  return {
    ...(city ? { latitude: found.latitude, longitude: found.longitude } : position),
    name: found.name,
    ...(typeof found.country === 'string' && found.country ? { country: found.country } : {}),
    // An id belongs to the city's coordinates, never to the user's own.
    ...(city && isValidLocationId(found.id) ? { id: found.id } : {}),
  };
}

/**
 * The user's position as a place to open: the city they are in when the server matched
 * it (same coordinates and id as from search, so a saved city is recognised as saved),
 * otherwise the position itself. If no answer comes in time, the forecast opens anyway
 * for the position and the page shows the coordinates.
 */
/**
 * A saved city wins over what the location found: the page then is that saved entry, so
 * it says "Saved" and can't be added twice. The server already returns a city's own
 * coordinates, but not always (no match in search, an older answer from the HTTP cache,
 * or a city saved earlier from the user's own position); this check needs neither.
 */
export function preferSaved(place: FoundPlace, favorites: readonly Favorite[]): FoundPlace {
  const saved = findSavedCity(favorites, { ...place, name: place.name ?? '' });
  return saved ?? place;
}

export async function locatePlace(language: string): Promise<FoundPlace> {
  const position = await getCurrentPosition();
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), NAME_WAIT_MS));
  const found = await Promise.race([reversePlace(position, language).catch(() => null), timeout]);
  const place = preferSaved(toFoundPlace(found, position), getSnapshot().favorites);
  // What the page opens is where "You are here" goes.
  rememberPosition(place);
  return place;
}

/**
 * The city guessed from the IP address, as a place to open: offered, not opened, when the
 * browser can't locate the user. Null when the server can't tell. Saved cities win here
 * too, so the suggestion is the saved Warsaw, not a second one.
 */
export async function approximatePlace(language: string): Promise<FoundPlace | null> {
  try {
    const found = await api.approximateLocation({ language });
    if (!found?.name || !isValidCoordinates(found.latitude, found.longitude)) return null;
    return preferSaved(
      {
        latitude: found.latitude,
        longitude: found.longitude,
        name: found.name,
        ...(found.country ? { country: found.country } : {}),
        ...(isValidLocationId(found.id) ? { id: found.id } : {}),
      },
      getSnapshot().favorites,
    );
  } catch {
    return null;
  }
}

/** The crosshair in the search field: find the position on demand, report why it failed. */
export function useLocateMe() {
  const { language } = useI18n();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<LocationError | null>(null);
  /** The city from the IP, offered in the error message. */
  const [suggestion, setSuggestion] = useState<FoundPlace | null>(null);
  // Each lookup gets a number; cancel() moves it on, so an older lookup's answer is dropped.
  const attempt = useRef(0);

  /**
   * The place to open, or null (failed, or cancelled meanwhile). A lookup can take long:
   * the browser's prompt waits for the user, then up to 10 s for a position and 4 s for
   * a name. By then the user may have opened another city; its late answer must not take
   * them away from it.
   */
  const locate = useCallback(async (): Promise<FoundPlace | null> => {
    const current = ++attempt.current;
    setLocating(true);
    setError(null);
    setSuggestion(null);
    try {
      const place = await locatePlace(language);
      return attempt.current === current ? place : null;
    } catch (err) {
      if (attempt.current !== current) return null;
      const reason = err as LocationError;
      setError(reason);
      // Not after a refusal: the user said no to sharing their location, and guessing it
      // from the address anyway would go around that answer.
      if (reason !== 'denied') {
        void approximatePlace(language).then((place) => {
          if (attempt.current === current) setSuggestion(place);
        });
      }
      return null;
    } finally {
      if (attempt.current === current) setLocating(false);
    }
  }, [language]);

  /** The user did something else (picked a city, typed, navigated): drop a running lookup. */
  const cancel = useCallback(() => {
    attempt.current++;
    setLocating(false);
    setError(null);
    setSuggestion(null);
  }, []);

  /** Closes the message (error and suggestion). */
  const clearError = useCallback(() => {
    setError(null);
    setSuggestion(null);
  }, []);
  return { locate, cancel, locating, error, suggestion, clearError };
}
