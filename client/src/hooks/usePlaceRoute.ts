import { ApiError, ERROR_CODES, type ErrorCode } from '@weather/shared';
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import type { Place, PlaceRoute } from '../locationUrl';
import { resolveRoute, type RouteState } from '../placeRoute';
import { useFavorites } from './useFavorites';
import { cachedLocation, loadLocation } from './useLocalizedPlace';

/**
 * The place a /weather/… link points at and the link it should have (see `resolveRoute`).
 * Looks the id up in the interface language and in English, through the cache the place
 * names share, so the page and its name cost one request per language.
 */
export function usePlaceRoute(route: PlaceRoute | null): {
  state: RouteState;
  canonical: string | null;
  retry: () => void;
} {
  const { language } = useI18n();
  const { favorites } = useFavorites();
  const [, setLoaded] = useState(0);
  const [failure, setFailure] = useState<{ key: string; code: ErrorCode } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The last place shown, so a change of language keeps it while the names load.
  const [previous, setPrevious] = useState<Place | undefined>(undefined);

  const id = route?.kind === 'id' ? route.id : route?.place.id;
  const requestKey = id ? `${language}:${id}:${attempt}` : null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    // No reset of `failure` here: it is kept with its request's key, so a new request (another
    // language, a retry) does not see it.
    // Each settles on its own: one language failing must not hide the other's answer.
    Promise.allSettled([loadLocation(id, language), loadLocation(id, 'en')]).then((results) => {
      if (cancelled) return;
      setLoaded((n) => n + 1);
      const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      // The API client's code (no connection, provider down…), so the message says which.
      if (rejected && requestKey) {
        const code = rejected.reason instanceof ApiError ? rejected.reason.code : ERROR_CODES.INTERNAL;
        setFailure({ key: requestKey, code });
      }
    });
    return () => {
      cancelled = true;
    };
    // `requestKey` is built from `id` and `language`, so listing them changes nothing.
  }, [id, language, requestKey]);

  const result = resolveRoute(route, {
    favorites,
    local: id ? cachedLocation(id, language) : undefined,
    english: id ? cachedLocation(id, 'en') : undefined,
    previous,
    failed: failure && failure.key === requestKey ? failure.code : null,
  });
  // Remembered during render, as React advises for state that follows other values; compared
  // by content, since resolveRoute may build a new object each time.
  const ready = result.state.status === 'ready' ? result.state.place : undefined;
  if (ready && !samePlaceShown(ready, previous)) setPrevious(ready);
  return { ...result, retry: () => setAttempt((n) => n + 1) };
}

function samePlaceShown(a: Place, b: Place | undefined): boolean {
  return (
    !!b &&
    a.id === b.id &&
    a.latitude === b.latitude &&
    a.longitude === b.longitude &&
    a.name === b.name &&
    a.country === b.country
  );
}
