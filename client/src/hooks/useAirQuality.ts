import { summarizeAirQuality, type AirQuality, type AirQualitySummary } from '@weather/shared';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { createQueryCache } from '../api/queryCache';

export interface AirQualityView {
  summary: AirQualitySummary;
  pollutants: AirQuality['pollutants'];
}

/** Shared across the app, 15 minutes like the API's Cache-Control max-age. */
const airQualityCache = createQueryCache<AirQuality>({ ttlMs: 15 * 60 * 1000 });

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
 */
export function useAirQuality(
  latitude: number | null,
  longitude: number | null,
): AirQualityView | null | undefined {
  const key = latitude === null || longitude === null ? null : `${latitude},${longitude}`;
  const [state, setState] = useState<{ key: string | null; view: AirQualityView | null }>({
    key: null,
    view: null,
  });

  useEffect(() => {
    if (latitude === null || longitude === null) return;
    const requestKey = `${latitude},${longitude}`;
    let cancelled = false;
    airQualityCache
      .load(requestKey, () => api.getAirQuality(latitude, longitude))
      .then((airQuality) => {
        if (!cancelled) setState({ key: requestKey, view: toView(airQuality) });
      })
      .catch(() => {
        if (!cancelled) setState({ key: requestKey, view: null });
      });
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude]);

  // Never the previous city's value; a cached one is shown at once.
  if (state.key === key) return state.view;
  if (!key) return null;
  const cached = airQualityCache.get(key);
  return cached ? toView(cached) : undefined;
}
