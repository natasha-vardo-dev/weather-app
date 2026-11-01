import { ALERTS_FEED_TTL_SECONDS, type AlertLevel, type AlertsResponse } from '@weather/shared';
import { useEffect, useState } from 'react';
import { unexpiredAlerts } from '../alertTime';
import { api } from '../api/client';
import { createQueryCache } from '../api/queryCache';
import { useI18n } from '../i18n/I18nProvider';
import { useNow } from './useNow';

/** One minute, like the API's max-age: warnings must not lag (see ALERTS_FEED_TTL_SECONDS). */
export const ALERTS_TTL_MS = 60 * 1000;

/**
 * How often an open page asks again: the server keeps each country's feed this long, so asking
 * more often mostly gets the same answer, at a request per place shown (ten favourites: ten).
 * Shown within MeteoAlarm's 10 minutes all the same; expired warnings go by the clock anyway.
 */
export const ALERTS_REFRESH_MS = ALERTS_FEED_TTL_SECONDS * 1000;

const alertsCache = createQueryCache<AlertsResponse>({ ttlMs: ALERTS_TTL_MS });

/**
 * Official warnings for a place, texts in the interface language where the issuer has it.
 * undefined while loading or after an error: like air quality, a failure stays silent and
 * never touches the forecast. Not saved for offline use: an old warning shown as current
 * is worse than none.
 *
 * Revalidated while the page is open: once the answer is older than ALERTS_REFRESH_MS, again
 * when the tab comes back into view with an older one, and when the connection returns with
 * the tab in view. Never while the tab is hidden. Every component showing a place shares the cache, so they
 * all ask at the same moment and the cache turns that into one request; a value one of them
 * stored reaches the others through `subscribe`. A failed refresh keeps the last answer; its
 * expired warnings are dropped by the components, by the clock.
 */
export function useAlerts(latitude: number | null, longitude: number | null): AlertsResponse | undefined {
  const { language } = useI18n();
  const key = latitude === null || longitude === null ? null : `${latitude},${longitude},${language}`;
  const [state, setState] = useState<{ key: string; value: AlertsResponse } | null>(null);

  useEffect(() => {
    if (latitude === null || longitude === null) return;
    const requestKey = `${latitude},${longitude},${language}`;
    const fetchAlerts = () => api.getAlerts(latitude, longitude, { language });
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const show = (value: AlertsResponse) =>
      setState((prev) => (prev?.key === requestKey && prev.value === value ? prev : { key: requestKey, value }));

    // The next check once the answer is ALERTS_REFRESH_MS old (by then the cache holds it as
    // stale, so it asks the server), or that long from now without one. Nothing while hidden.
    function schedule() {
      clearTimeout(timer);
      if (cancelled || document.visibilityState !== 'visible') return;
      const age = alertsCache.age(requestKey);
      timer = setTimeout(refresh, age === undefined ? ALERTS_REFRESH_MS : Math.max(0, ALERTS_REFRESH_MS - age));
    }

    const due = () => {
      const age = alertsCache.age(requestKey);
      return age === undefined || age >= ALERTS_REFRESH_MS;
    };

    // A fresh cached answer, the shared request in flight, or a new request.
    function refresh() {
      clearTimeout(timer);
      alertsCache.load(requestKey, fetchAlerts).then(
        (value) => {
          if (!cancelled) show(value);
          schedule();
        },
        // The answer kept is as old as before, so scheduling by its age would ask again at
        // once, in a loop while offline: the next try is a whole interval away instead.
        () => {
          clearTimeout(timer);
          if (!cancelled && document.visibilityState === 'visible') timer = setTimeout(refresh, ALERTS_REFRESH_MS);
        },
      );
    }

    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') clearTimeout(timer);
      else if (due()) refresh();
      else schedule();
    }

    // Hidden: the visibility handler asks once the tab is shown.
    function onOnline() {
      if (document.visibilityState === 'visible') refresh();
    }

    const unsubscribe = alertsCache.subscribe((storedKey) => {
      if (cancelled || storedKey !== requestKey) return;
      const value = alertsCache.get(requestKey);
      if (value) show(value);
      schedule();
    });
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);
    refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
    };
  }, [latitude, longitude, language]);

  if (!key) return undefined;
  return state?.key === key ? state.value : alertsCache.get(key);
}

/**
 * The most severe warning's level at a place, or null: the mark on a favourite. The same
 * request as the city page (shared cache), so opening the city shows its warnings at once.
 * Expired warnings don't count, as on the city page.
 */
export function useAlertLevel(latitude: number, longitude: number): AlertLevel | null {
  const alerts = useAlerts(latitude, longitude)?.alerts;
  const now = useNow().getTime();
  // Alerts arrive sorted, most severe first.
  return (alerts && unexpiredAlerts(alerts, now)[0]?.level) ?? null;
}
