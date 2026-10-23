import { compareWithYesterday, describeWeather, type Forecast } from '@weather/shared';
import { useEffect, useRef } from 'react';

interface Props {
  name: string;
  country?: string;
  forecast: Forecast;
}

export function CurrentWeather({ name, country, forecast }: Props) {
  const { current, units } = forecast;
  const { label } = describeWeather(current.weatherCode);
  const today = forecast.daily[0];
  const trend =
    today && forecast.yesterday
      ? compareWithYesterday(today.tempMax, forecast.yesterday.tempMax)
      : null;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // In an SPA the browser doesn't announce "new page", so move focus to the heading:
  // screen readers read the new city, and keyboard users continue from here.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [name]);

  return (
    <section className="now" aria-labelledby="now-title">
      <h1 id="now-title" className="now__place" ref={headingRef} tabIndex={-1}>
        {name}
        {country && <span className="now__country">{country}</span>}
      </h1>
      <p className="now__temp" aria-label={`${Math.round(current.temperature)} degrees`}>
        {Math.round(current.temperature)}°
      </p>
      <p className="now__label">
        {label}
        {today && (
          <span className="now__hilo">
            {' '}
            High {Math.round(today.tempMax)}°, low {Math.round(today.tempMin)}°
          </span>
        )}
      </p>
      {trend && (
        <p className="now__trend">
          {trend.trend === 'same'
            ? 'About the same as yesterday'
            : `${trend.difference}° ${trend.trend} than yesterday`}
        </p>
      )}
      <dl className="now__details">
        <div>
          <dt>Feels like</dt>
          <dd>{Math.round(current.apparentTemperature)}°</dd>
        </div>
        <div>
          <dt>Humidity</dt>
          <dd>{current.humidity}%</dd>
        </div>
        <div>
          <dt>Wind</dt>
          <dd>
            {Math.round(current.windSpeed)} {units.windSpeed}
          </dd>
        </div>
      </dl>
    </section>
  );
}
