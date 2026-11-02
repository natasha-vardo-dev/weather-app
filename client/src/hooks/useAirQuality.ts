import { summarizeAirQuality, type AirQuality, type AirQualitySummary } from '@weather/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { createQueryCache } from '../api/queryCache';
import { isSavedValue, savedReason, type SavedReason } from '../api/savedResponses';
import { useReportSaved } from './useReportSaved';
import { useRevalidateOnReturn } from './useRevalidateOnReturn';

export interface AirQualityView {
  summary: AirQualitySummary;
  pollutants: AirQuality['pollutants'];
}

/** Shared across the app, 15 minutes like the API's Cache-Control max-age; old saved answers are not kept. */
const airQualityCache = createQueryCache<AirQuality>({
  ttlMs: 15 * 60 * 1000,
  keep: (airQuality) => !isSavedValue(airQuality),
});

/**
 * After a failure, one quiet retry this much later: most provider hiccups are short, and
 * the item is otherwise hidden until the city is reopened. One retry, not a backoff loop:
 * it is secondary data, and every retry spends the provider's rate limit.
 */
export const AIR_QUALITY_RETRY_MS = 20_000;

/** The provider updates air quality hourly and the server keeps it an hour: sooner gets the same answer. */
export const AIR_QUALITY_REFRESH_MS = 60 * 60 * 1000;

const isAirQualityDue = (key: string) => (airQualityCache.age(key) ?? Infinity) >= AIR_QUALITY_REFRESH_MS;

function toView(airQuality: AirQuality | undefined): AirQualityView | null {
  if (!airQuality) return null;
  const summary = summarizeAirQuality(airQuality);
  return summary ? { summary, pollutants: airQuality.pollutants } : null;
}

/**
 * Air quality for a place: undefined while loading (the UI keeps the slot so nothing
 * shifts), null without data or on error, otherwise the view.
 * Errors stay silent on purpose: it is extra information, and the forecast
 * (fetched separately) must not fail or show an error because of it.
 * A failed load is retried once by itself after AIR_QUALITY_RETRY_MS. `retry` loads again
 * at once (errors are not cached); the page calls it together with the forecast's retry,
 * so "Try again" after an outage brings both back.
 * Like the forecast, loaded again when the page comes back into view with a value older than
 * AIR_QUALITY_REFRESH_MS; the shown value stays until the new one arrives, and if that fails.
 */
export function useAirQuality(
  latitude: number | null,
  longitude: number | null,
): { airQuality: AirQualityView | null | undefined; retry: () => void } {
  const key = latitude === null || longitude === null ? null : `${latitude},${longitude}`;
  const [state, setState] = useState<{ key: string | null; view: AirQualityView | null; saved?: SavedReason }>({
    key: null,
    view: null,
  });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // The place that already had its automatic retry: one per place visit.
  const autoRetriedFor = useRef<string | null>(null);
  const revision = useRevalidateOnReturn(key, isAirQualityDue);

  // A new place (or a return to an earlier one) is a new visit with its own retry.
  // Declared before the loading effect, so it runs first when the place changes.
  useEffect(() => {
    autoRetriedFor.current = null;
  }, [latitude, longitude]);

  useEffect(() => {
    if (latitude === null || longitude === null) return;
    const requestKey = `${latitude},${longitude}`;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    airQualityCache
      .load(requestKey, () => api.getAirQuality(latitude, longitude))
      .then((airQuality) => {
        if (!cancelled) setState({ key: requestKey, view: toView(airQuality), saved: savedReason(airQuality) });
      })
      .catch(() => {
        if (cancelled) return;
        setState((prev) => (prev.key === requestKey && prev.view ? prev : { key: requestKey, view: null }));
        if (autoRetriedFor.current !== requestKey) {
          autoRetriedFor.current = requestKey;
          retryTimer = setTimeout(retry, AIR_QUALITY_RETRY_MS);
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [latitude, longitude, attempt, retry, revision]);

  // Never the previous city's value; a cached one is shown at once.
  let airQuality: AirQualityView | null | undefined;
  let saved: SavedReason | undefined;
  if (state.key === key) {
    airQuality = state.view;
    saved = state.view !== null ? state.saved : undefined;
  } else if (!key) airQuality = null;
  else {
    const cached = airQualityCache.get(key);
    airQuality = cached ? toView(cached) : undefined;
  }
  useReportSaved(saved);
  return { airQuality, retry };
}
