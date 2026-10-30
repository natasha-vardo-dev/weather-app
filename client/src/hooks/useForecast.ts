import { ERROR_CODES, isRetryable, type ErrorCode, type Forecast } from '@weather/shared';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { createQueryCache } from '../api/queryCache';
import { isSavedValue } from '../api/savedResponses';
import { useReportSaved } from './useReportSaved';

export interface ForecastError {
  /** Translated on render, so switching language also translates a shown error. */
  code: ErrorCode;
  canRetry: boolean;
}

interface State {
  /** Which coordinates the forecast and error belong to. */
  key: string | null;
  forecast: Forecast | null;
  error: ForecastError | null;
}

/**
 * One cache for the whole app: the city page, favourite tiles and the start-page list
 * share loaded forecasts. 5 minutes matches the API's Cache-Control max-age.
 * Old answers the service worker saved are not kept: the next view asks the network again.
 */
const forecastCache = createQueryCache<Forecast>({
  ttlMs: 5 * 60 * 1000,
  keep: (forecast) => !isSavedValue(forecast),
});

/**
 * The place's time zone, from the shared forecast cache (usually loaded already: a tile or
 * card showed it), or undefined if the forecast can't be loaded.
 */
export function loadTimeZone(latitude: number, longitude: number): Promise<string | undefined> {
  return forecastCache
    .load(`${latitude},${longitude}`, () => api.getForecast(latitude, longitude))
    .then((forecast) => forecast.timezone, () => undefined);
}

function toError(err: unknown): ForecastError {
  return err instanceof ApiError
    ? { code: err.code, canRetry: isRetryable(err.code) }
    : { code: ERROR_CODES.INTERNAL, canRetry: true };
}

/** Takes plain numbers so a new object with the same coordinates doesn't refetch. */
export function useForecast(latitude: number | null, longitude: number | null) {
  const key = latitude === null || longitude === null ? null : `${latitude},${longitude}`;
  const [state, setState] = useState<State>({ key: null, forecast: null, error: null });
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (latitude === null || longitude === null) return;
    const requestKey = `${latitude},${longitude}`;
    // The request is shared with other components, so it is not aborted on unmount;
    // a late answer is just ignored.
    let cancelled = false;
    setLoading(true);
    forecastCache
      .load(requestKey, () => api.getForecast(latitude, longitude))
      .then((forecast) => {
        if (!cancelled) setState({ key: requestKey, forecast, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ key: requestKey, forecast: null, error: toError(err) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Results for other coordinates are never returned: no flash of the previous city.
  // A forecast already in the cache is returned on the very first render, so switching
  // to a loaded place shows it at once instead of a loading state.
  const isCurrent = state.key === key;
  const cached = key ? (forecastCache.get(key) ?? null) : null;
  const forecast = isCurrent ? (state.forecast ?? cached) : cached;
  useReportSaved(isSavedValue(forecast));
  return {
    forecast,
    error: isCurrent ? state.error : null,
    loading: loading && !cached,
    retry,
  };
}
