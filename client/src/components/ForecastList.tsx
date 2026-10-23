import { describeWeather, formatDay, rangePosition, type DailyForecast } from '@weather/shared';
import { WeatherIcon } from './WeatherIcon';

interface Props {
  /** Starts with today in the place's timezone. */
  days: DailyForecast[];
}

export function ForecastList({ days }: Props) {
  const today = days[0]?.date ?? '';
  const weekMin = Math.min(...days.map((d) => d.tempMin));
  const weekMax = Math.max(...days.map((d) => d.tempMax));

  return (
    <section className="week" aria-labelledby="week-title">
      <h2 id="week-title" className="week__title">
        Next {days.length} days
      </h2>
      <ol className="week__list">
        {days.map((day) => {
          const { label, icon } = describeWeather(day.weatherCode);
          const { left, width } = rangePosition(day.tempMin, day.tempMax, weekMin, weekMax);
          return (
            <li key={day.date} className="day">
              <span className="day__name">{formatDay(day.date, today)}</span>
              {/* A daily forecast covers the whole day, so always the day-time icon. */}
              <WeatherIcon icon={icon} isDay />
              <span className="day__label">
                {label}
                {day.precipitationProbability !== null && day.precipitationProbability >= 30 && (
                  <span className="day__rain"> {day.precipitationProbability}% rain</span>
                )}
              </span>
              <span className="day__min">{Math.round(day.tempMin)}°</span>
              <span className="day__bar" aria-hidden="true">
                <span className="day__range" style={{ left: `${left}%`, width: `${width}%` }} />
              </span>
              <span className="day__max">{Math.round(day.tempMax)}°</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
