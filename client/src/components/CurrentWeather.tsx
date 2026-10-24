import { compareWithYesterday, describeWeather, type Forecast } from '@weather/shared';
import { useEffect, useId, useRef, useState } from 'react';
import type { AirQualityView } from '../hooks/useAirQuality';
import { useI18n } from '../i18n/I18nProvider';
import { AirQualityItem, hasPollutants, PollutantsPanel } from './AirQualityDetails';

interface Props {
  name: string;
  country?: string;
  forecast: Forecast;
  /** Null hides the item: still loading, no data for the place, or the request failed. */
  airQuality: AirQualityView | null;
}

export function CurrentWeather({ name, country, forecast, airQuality }: Props) {
  const { t, deg, speed, percent } = useI18n();
  const { current, units } = forecast;
  const label = t.conditions[describeWeather(current.weatherCode).condition];
  const today = forecast.daily[0];
  const trend =
    today && forecast.yesterday
      ? compareWithYesterday(today.tempMax, forecast.yesterday.tempMax)
      : null;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [pollutantsOpen, setPollutantsOpen] = useState(false);
  const pollutantsId = useId();

  // In an SPA the browser doesn't announce "new page", so move focus to the heading:
  // screen readers read the new city, and keyboard users continue from here.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    // A new city starts with the details folded.
    setPollutantsOpen(false);
  }, [name]);

  return (
    <section className="now" aria-labelledby="now-title">
      <h1 id="now-title" className="now__place" ref={headingRef} tabIndex={-1}>
        {name}
        {country && <span className="now__country">{country}</span>}
      </h1>
      <p className="now__temp" aria-label={t.current.degrees(Math.round(current.temperature))}>
        {deg(Math.round(current.temperature))}
      </p>
      <p className="now__label">
        {label}
        {today && (
          <span className="now__hilo">
            {' '}
            {t.current.highLow(Math.round(today.tempMax), Math.round(today.tempMin))}
          </span>
        )}
      </p>
      {trend && (
        <p className="now__trend">
          {trend.trend === 'same'
            ? t.current.same
            : t.current[trend.trend](trend.difference)}
        </p>
      )}
      <dl className="now__details">
        <div>
          <dt>{t.current.feelsLike}</dt>
          <dd>{deg(Math.round(current.apparentTemperature))}</dd>
        </div>
        <div>
          <dt>{t.current.humidity}</dt>
          <dd>{percent(current.humidity)}</dd>
        </div>
        <div>
          <dt>{t.current.wind}</dt>
          <dd>{speed(current.windSpeed, units.windSpeed)}</dd>
        </div>
        {airQuality && (
          <AirQualityItem
            airQuality={airQuality}
            open={pollutantsOpen}
            onToggle={() => setPollutantsOpen((open) => !open)}
            panelId={pollutantsId}
          />
        )}
      </dl>
      {airQuality && hasPollutants(airQuality) && (
        <PollutantsPanel airQuality={airQuality} open={pollutantsOpen} id={pollutantsId} />
      )}
    </section>
  );
}
