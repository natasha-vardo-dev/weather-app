import { compareWithYesterday, describeWeather, type Forecast } from '@weather/shared';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { AirQualityView } from '../hooks/useAirQuality';
import { useI18n } from '../i18n/I18nProvider';
import { useUnits } from '../units/UnitProvider';
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
  const { temp } = useUnits();
  const { current, units } = forecast;
  const label = t.conditions[describeWeather(current.weatherCode).condition];
  const today = forecast.daily[0];
  // Compared in the chosen unit, so the difference reads in that unit too (2 °C apart is 4 °F).
  const trend =
    today && forecast.yesterday
      ? compareWithYesterday(temp(today.tempMax), temp(forecast.yesterday.tempMax))
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
      {/* aria-label is not allowed on a paragraph and often ignored: hidden text instead. */}
      <p className="now__temp">
        <span className="visually-hidden">{t.current.degrees(temp(current.temperature))}</span>
        <span aria-hidden="true">{deg(temp(current.temperature))}</span>
      </p>
      <p className="now__label">
        {label}
        {today && (
          <span className="now__hilo">
            {' '}
            {t.current.highLow(temp(today.tempMax), temp(today.tempMin))}
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
          <dd>{deg(temp(current.apparentTemperature))}</dd>
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
