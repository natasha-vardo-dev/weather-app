import { summarizeAirQuality, type AirQuality, type AirQualitySummary } from '@weather/shared';
import { useEffect, useState } from 'react';
import { api } from '../api/client';

export interface AirQualityView {
  summary: AirQualitySummary;
  pollutants: AirQuality['pollutants'];
}

/**
 * Air quality for a place, or null while loading, without data, or on error.
 * Errors stay silent on purpose: it is extra information, and the forecast
 * (fetched separately) must not fail or show an error because of it.
 */
export function useAirQuality(latitude: number | null, longitude: number | null) {
  const key = latitude === null || longitude === null ? null : `${latitude},${longitude}`;
  const [state, setState] = useState<{ key: string | null; view: AirQualityView | null }>({
    key: null,
    view: null,
  });

  useEffect(() => {
    if (latitude === null || longitude === null) return;
    const requestKey = `${latitude},${longitude}`;
    const controller = new AbortController();
    api
      .getAirQuality(latitude, longitude, controller.signal)
      .then((airQuality) => {
        const summary = summarizeAirQuality(airQuality);
        setState({
          key: requestKey,
          view: summary ? { summary, pollutants: airQuality.pollutants } : null,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ key: requestKey, view: null });
      });
    return () => controller.abort();
  }, [latitude, longitude]);

  // Never show the previous city's value while the new one loads.
  return state.key === key ? state.view : null;
}
