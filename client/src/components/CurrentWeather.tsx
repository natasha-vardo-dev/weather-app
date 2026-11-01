import { compareWithYesterday, describeWeather, type Forecast } from '@weather/shared';
import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import type { Whereabouts } from '../geolocation';
import { useI18n } from '../i18n/I18nProvider';
import { useUnits } from '../units/UnitProvider';
import { PinIcon } from './LocationIcons';
import { WeatherIcon } from './WeatherIcon';

interface Props {
  name: string;
  country?: string;
  /** Where in the country, on a line under the name: ["Powiat otwocki", "Masovian Voivodeship"]. */
  area?: string[];
  forecast: Forecast;
  /** Controls shown next to the place name, e.g. the save button. */
  actions?: ReactNode;
  /** The place is the user's: "You are here", or "Approximate, by IP" when guessed from the address. */
  here?: Whereabouts | null;
}

export function CurrentWeather({ name, country, area = [], forecast, actions, here }: Props) {
  const { t, deg } = useI18n();
  const { temp } = useUnits();
  const { current } = forecast;
  const { condition, icon } = describeWeather(current.weatherCode);
  const label = t.conditions[condition];
  const today = forecast.daily[0];
  // Compared in the chosen unit, so the difference reads in that unit too (2 °C apart is 4 °F).
  const trend =
    today && forecast.yesterday ? compareWithYesterday(temp(today.tempMax), temp(forecast.yesterday.tempMax)) : null;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hereMark = here && (
    <span className={here === 'approximate' ? 'now__here now__here--approximate' : 'now__here'}>
      <PinIcon />
      {here === 'approximate' ? t.location.approximate : t.location.here}
    </span>
  );
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
          {/* Country and "You are here" share one quiet line on the name's baseline (under the
              name on a phone): plain text, no pill, so it reads as a note, not as one of the
              buttons beside it. In the heading, so screen readers hear it with the name. */}
          {(country || here) && (
            <span className="now__sub">
              {country && <span className="now__country">{country}</span>}
              {country && here && (
                <span className="now__sep" aria-hidden="true">
                  {' '}
                  ·{' '}
                </span>
              )}
              {here && hereMark}
            </span>
          )}
        </h1>
        {actions}
      </div>
      {/* District and region on a line of their own under the name and the buttons, the full
          width (on a phone the column beside the buttons is too narrow): two Józefów in one
          voivodeship differ only by district, and the line by the name stays short. Each part
          keeps together, so a long line wraps at the dot, not inside a name. */}
      {area.length > 0 && (
        <p className="now__area">
          {area.map((part, i) => (
            <Fragment key={part}>
              {i > 0 && ' '}
              <span className="now__part">
                {part}
                {i < area.length - 1 && ' ·'}
              </span>
            </Fragment>
          ))}
        </p>
      )}
      {/* On a phone the mark moves under that line: by the name it made the column beside the
          buttons four lines tall. A copy, hidden from screen readers, which hear the one in the
          heading, with the name. */}
      {hereMark && (
        <p className="now__below" aria-hidden="true">
          {hereMark}
        </p>
      )}
      {/* aria-label is not allowed on a paragraph and often ignored: hidden text instead. The
          icon beside the number (variant A of four), decorative: the condition is the next line. */}
      <p className="now__temp">
        <span className="visually-hidden">{t.current.degrees(temp(current.temperature))}</span>
        <span aria-hidden="true">{deg(temp(current.temperature))}</span>
        <WeatherIcon icon={icon} isDay={current.isDay} />
      </p>
      {/* Three levels: the number; the condition, a little larger; then the details, one size
          and colour, one step apart. "Feels like" sits with the other temperatures of the day
          rather than as a small caption glued to the number, where it read as a footnote. */}
      <p className="now__label">{label}</p>
      <p className="now__line">
        {t.current.feelsLike} {deg(temp(current.apparentTemperature))}
        {today && <> · {t.current.highLow(temp(today.tempMax), temp(today.tempMin))}</>}
      </p>
      {trend && (
        <p className="now__trend">
          {trend.trend === 'same' ? t.current.same : t.current[trend.trend](trend.difference)}
        </p>
      )}
    </section>
  );
}
