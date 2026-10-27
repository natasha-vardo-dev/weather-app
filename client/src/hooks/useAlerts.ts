import type { AlertLevel, AlertsResponse } from '@weather/shared';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { createQueryCache } from '../api/queryCache';
import { useI18n } from '../i18n/I18nProvider';

/** One minute, like the API's max-age: warnings must not lag (see ALERTS_FEED_TTL_SECONDS). */
const alertsCache = createQueryCache<AlertsResponse>({ ttlMs: 60 * 1000 });

/**
 * Official warnings for a place, texts in the interface language where the issuer has it.
 * undefined while loading or after an error: like air quality, a failure stays silent and
 * never touches the forecast. Not saved for offline use: an old warning shown as current
 * is worse than none.
 */
export function useAlerts(latitude: number | null, longitude: number | null): AlertsResponse | undefined {
  const { language } = useI18n();
  const key = latitude === null || longitude === null ? null : `${latitude},${longitude},${language}`;
  const [state, setState] = useState<{ key: string; value: AlertsResponse } | null>(null);

  useEffect(() => {
    if (latitude === null || longitude === null) return;
    const requestKey = `${latitude},${longitude},${language}`;
    let cancelled = false;
    alertsCache
      .load(requestKey, () => api.getAlerts(latitude, longitude, { language }))
      .then((value) => {
        if (!cancelled) setState({ key: requestKey, value });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, language]);

  if (!key) return undefined;
  return state?.key === key ? state.value : alertsCache.get(key);
}

/**
 * The most severe warning's level at a place, or null: the mark on a favourite. The same
 * request as the city page (shared cache), so opening the city shows its warnings at once.
 */
export function useAlertLevel(latitude: number, longitude: number): AlertLevel | null {
  // Alerts arrive sorted, most severe first.
  return useAlerts(latitude, longitude)?.alerts[0]?.level ?? null;
}
