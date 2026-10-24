import { describeWeather, formatHour, type HourlyForecast as Hour } from '@weather/shared';
import { useI18n } from '../i18n/I18nProvider';
import { WeatherIcon } from './WeatherIcon';

interface Props {
  hours: Hour[];
}

/** Horizontally scrolling strip for the next 24 hours. */
export function HourlyForecast({ hours }: Props) {
  const { t, locale, deg, percent } = useI18n();
  if (hours.length === 0) return null;

  return (
    // A scrollable region must be focusable, or keyboard users can't scroll it.
    <section className="hours" aria-labelledby="hours-title">
      <h2 id="hours-title" className="hours__title">
        {t.hourly.title(hours.length)}
      </h2>
      <ol className="hours__list" tabIndex={0} aria-labelledby="hours-title">
        {hours.map((hour, i) => {
          const name = formatHour(hour.time, i, { locale, nowLabel: t.hourly.now });
          const temperature = Math.round(hour.temperature);
          const rain =
            hour.precipitationProbability !== null && hour.precipitationProbability >= 30
              ? hour.precipitationProbability
              : null;
          const { condition, icon } = describeWeather(hour.weatherCode);
          const label = t.conditions[condition];
          return (
            <li key={hour.time} className="hour" title={label}>
              {/* Screen readers get one sentence instead of three loose numbers. */}
              <span className="visually-hidden">
                {name}: {t.current.degrees(temperature)}, {label}
                {rain !== null && `, ${t.hourly.rainChance(percent(rain))}`}
              </span>
              <span className="hour__time" aria-hidden="true">
                {name}
              </span>
              <WeatherIcon icon={icon} isDay={hour.isDay} />
              <span className="hour__temp" aria-hidden="true">
                {deg(temperature)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
