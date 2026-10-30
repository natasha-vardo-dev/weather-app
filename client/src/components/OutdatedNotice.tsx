import { FORECAST_OUTDATED_MINUTES, forecastAgeMinutes, placeTimeToInstant, type Forecast } from '@weather/shared';
import { formatAlertTime } from '../alertTime';
import { useEffect, useState } from 'react';
import { useOffline } from '../hooks/useOffline';
import { useI18n } from '../i18n/I18nProvider';
import { ClockIcon } from './NoticeIcons';

/** Now, updated every minute: a page left open grows old without any new render. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * Says the city's forecast is old, with the time of its data: the server answers with the
 * last forecast it has (up to an hour old) when the provider is down, and a page left open
 * is not refreshed. Judged by the data's own time, so it needs nothing from the API and
 * covers both. Not while offline: that banner already says the forecast may be old.
 *
 * The live region stays in the page, so the notice is announced when it appears.
 */
export function OutdatedNotice({ forecast }: { forecast: Forecast | null }) {
  const { t, locale } = useI18n();
  const offline = useOffline();
  const now = useMinuteClock();
  const age = forecast ? forecastAgeMinutes(forecast.current.time, forecast.timezone, now) : 0;
  // The data's own instant, not one rebuilt from the age: that is rounded to the minute, and
  // with the seconds of now it showed 14:14 for 14:15 half the time. (Found by roborev.)
  const instant = forecast ? placeTimeToInstant(forecast.current.time, forecast.timezone) : null;
  // With the day when it is not today: a tab left open overnight would otherwise read
  // "2:15 PM" for yesterday's. (Found by roborev.)
  const since =
    forecast && instant !== null && !offline && age > FORECAST_OUTDATED_MINUTES
      ? formatAlertTime(new Date(instant).toISOString(), {
          locale,
          timeZone: forecast.timezone,
          now: now.getTime(),
          omitToday: true,
        })
      : null;
  return (
    <div role="status">
      {since && (
        <p className="notice">
          <ClockIcon />
          <span>{t.outdated(since)}</span>
        </p>
      )}
    </div>
  );
}
