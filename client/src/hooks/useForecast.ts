import { ERROR_CODES, isRetryable, type ErrorCode, type Forecast } from '@weather/shared';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, forecasts } from '../api/client';
import { createQueryCache } from '../api/queryCache';
import { isSavedValue, savedReason } from '../api/savedResponses';
import { useReportSaved } from './useReportSaved';
import { useRevalidateOnReturn } from './useRevalidateOnReturn';

export interface ForecastError {
  /** Translated on render, so switching language also translates a shown error. */
  code: ErrorCode;
  canRetry: boolean;
}

interface State {
  /** Which coordinates the forecast and error belong to. */
  key: string | null;
  /** Which request (coordinates and attempt) settled last: loading until it is the current one. */
  settled: string | null;
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
    .load(`${latitude},${longitude}`, () => forecasts.getForecast(latitude, longitude))
    .then(
      (forecast) => forecast.timezone,
      () => undefined,
    );
}

/**
 * How old a shown forecast must be to load again when the page comes back into view: the
 * server keeps a forecast this long (Open-Meteo's current weather is per 15 minutes), so asking
 * sooner would get the same answer.
 */
export const FORECAST_REFRESH_MS = 15 * 60 * 1000;

const isForecastDue = (key: string) => (forecastCache.age(key) ?? Infinity) >= FORECAST_REFRESH_MS;

function toError(err: unknown): ForecastError {
  return err instanceof ApiError
    ? { code: err.code, canRetry: isRetryable(err.code) }
    : { code: ERROR_CODES.INTERNAL, canRetry: true };
}

/**
 * Takes plain numbers so a new object with the same coordinates doesn't refetch.
 * `batch`: saved cities' tiles and cards, asked for together, go out as one request
 * (`forecastBatch.ts`); the city page's own forecast goes alone.
 *
 * Loaded again when the page comes back into view with a forecast older than
 * FORECAST_REFRESH_MS (`useRevalidateOnReturn`), without a loading state: the old one stays
 * until the new one arrives, and stays if that fails.
 */
export function useForecast(latitude: number | null, longitude: number | null, { batch = false } = {}) {
  const key = latitude === null || longitude === null ? null : `${latitude},${longitude}`;
  const [state, setState] = useState<State>({ key: null, settled: null, forecast: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const request = key === null ? null : `${key}#${attempt}`;
  const revision = useRevalidateOnReturn(key, isForecastDue);

  useEffect(() => {
    if (latitude === null || longitude === null) return;
    const requestKey = `${latitude},${longitude}`;
    // The request is shared with other components, so it is not aborted on unmount;
    // a late answer is just ignored.
    let cancelled = false;
    const settled = `${requestKey}#${attempt}`;
    // Out of a batch its tile may have queued it in this same render.
    if (!batch) forecasts.sendAlone(latitude, longitude);
    forecastCache
      .load(requestKey, () =>
        batch ? forecasts.getForecast(latitude, longitude) : api.getForecast(latitude, longitude),
      )
      .then((forecast) => {
        if (!cancelled) setState({ key: requestKey, settled, forecast, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // A failed refresh keeps the forecast shown; the outdated notice says how old it is.
        setState((prev) =>
          prev.key === requestKey && prev.forecast
            ? { ...prev, settled }
            : { key: requestKey, settled, forecast: null, error: toError(err) },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, attempt, batch, revision]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Results for other coordinates are never returned: no flash of the previous city.
  // A forecast already in the cache is returned on the very first render, so switching
  // to a loaded place shows it at once instead of a loading state.
  const isCurrent = state.key === key;
  // Worked out, not flagged in the effect (that rendered every request twice).
  const loading = request !== null && state.settled !== request;
  const cached = key ? (forecastCache.get(key) ?? null) : null;
  const forecast = isCurrent ? (state.forecast ?? cached) : cached;
  useReportSaved(savedReason(forecast));
  return {
    forecast,
    error: isCurrent ? state.error : null,
    loading: loading && !cached,
    retry,
  };
}
