import { ERROR_CODES, isRetryable, type ErrorCode, type Forecast } from '@weather/shared';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';

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

/** Takes plain numbers so a new object with the same coordinates doesn't refetch. */
export function useForecast(latitude: number | null, longitude: number | null) {
  const key = latitude === null || longitude === null ? null : `${latitude},${longitude}`;
  const [state, setState] = useState<State>({ key: null, forecast: null, error: null });
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (latitude === null || longitude === null) return;
    const requestKey = `${latitude},${longitude}`;
    const controller = new AbortController();
    setLoading(true);
    api
      .getForecast(latitude, longitude, { signal: controller.signal })
      .then((forecast) => setState({ key: requestKey, forecast, error: null }))
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setState({
          key: requestKey,
          forecast: null,
          error:
            err instanceof ApiError
              ? { code: err.code, canRetry: isRetryable(err.code) }
              : { code: ERROR_CODES.INTERNAL, canRetry: true },
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [latitude, longitude, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Results for other coordinates are never returned: no flash of the previous city.
  const isCurrent = state.key === key;
  return {
    forecast: isCurrent ? state.forecast : null,
    error: isCurrent ? state.error : null,
    loading,
    retry,
  };
}
