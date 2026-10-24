import { compareWithYesterday, describeWeather, type Forecast } from '@weather/shared';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { AirQualityView } from '../hooks/useAirQuality';
import { useI18n } from '../i18n/I18nProvider';
import { AirQualityItem, hasPollutants, PollutantsPanel } from './AirQualityDetails';

interface Props {
  name: string;
  country?: string;
  forecast: Forecast;
  /** Controls shown next to the place name, e.g. the save button. */
  actions?: ReactNode;
  /** Undefined while loading (the slot is kept), null hides the item (no data or error). */
  airQuality: AirQualityView | null | undefined;
}

export function CurrentWeather({ name, country, forecast, airQuality, actions }: Props) {
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
  // Runs on mount only: the page remounts this component for every place (keyed by
  // coordinates), which also starts each place with the pollutants folded. Keying by
  // place, not by name, matters for two saved cities with the same name.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="now" aria-labelledby="now-title">
      <div className="now__head">
        <h1 id="now-title" className="now__place" ref={headingRef} tabIndex={-1}>
          {name}
          {country && <span className="now__country">{country}</span>}
        </h1>
        {actions}
      </div>
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
        {airQuality === undefined && (
          // Same slot while loading, so the row does not reflow when the value arrives.
          <div aria-hidden="true">
            <dt>{t.current.airQuality}</dt>
            <dd>
              <span className="skeleton__block skeleton__inline" />
            </dd>
          </div>
        )}
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
