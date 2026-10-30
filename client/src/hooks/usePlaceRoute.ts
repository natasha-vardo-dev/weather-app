import { ApiError, ERROR_CODES, type ErrorCode } from '@weather/shared';
import { useEffect, useRef, useState } from 'react';
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
  const previous = useRef<Place | undefined>(undefined);

  const id = route?.kind === 'id' ? route.id : route?.place.id;
  const requestKey = id ? `${language}:${id}:${attempt}` : null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setFailure(null);
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
    previous: previous.current,
    failed: failure && failure.key === requestKey ? failure.code : null,
  });
  if (result.state.status === 'ready') previous.current = result.state.place;
  return { ...result, retry: () => setAttempt((n) => n + 1) };
}
