import { describeWeather, formatHour, type HourlyForecast as Hour } from '@weather/shared';

interface Props {
  hours: Hour[];
}

/** Horizontally scrolling strip for the next 24 hours. */
export function HourlyForecast({ hours }: Props) {
  if (hours.length === 0) return null;

  return (
    // A scrollable region must be focusable, or keyboard users can't scroll it.
    <section className="hours" aria-labelledby="hours-title">
      <h2 id="hours-title" className="hours__title">
        Next {hours.length} hours
      </h2>
      <ol className="hours__list" tabIndex={0} aria-labelledby="hours-title">
        {hours.map((hour, i) => {
          const name = formatHour(hour.time, i);
          const temperature = Math.round(hour.temperature);
          const rain =
            hour.precipitationProbability !== null && hour.precipitationProbability >= 30
              ? hour.precipitationProbability
              : null;
          const { label } = describeWeather(hour.weatherCode);
          return (
            <li key={hour.time} className="hour" title={label}>
              {/* Screen readers get one sentence instead of three loose numbers. */}
              <span className="visually-hidden">
                {name}: {temperature} degrees, {label}
                {rain !== null && `, ${rain}% chance of rain`}
              </span>
              <span className="hour__time" aria-hidden="true">
                {name}
              </span>
              <span className="hour__temp" aria-hidden="true">
                {temperature}°
              </span>
              <span className="hour__rain" aria-hidden="true">
                {rain !== null ? `${rain}%` : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
