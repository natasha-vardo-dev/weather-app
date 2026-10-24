import { describeWeather, formatDay, rangePosition, type DailyForecast } from '@weather/shared';
import { useI18n } from '../i18n/I18nProvider';
import { WeatherIcon } from './WeatherIcon';

interface Props {
  /** Starts with today in the place's timezone. */
  days: DailyForecast[];
}

export function ForecastList({ days }: Props) {
  const { t, locale, deg, percent } = useI18n();
  const today = days[0]?.date ?? '';
  const weekMin = Math.min(...days.map((d) => d.tempMin));
  const weekMax = Math.max(...days.map((d) => d.tempMax));

  return (
    <section className="week" aria-labelledby="week-title">
      <h2 id="week-title" className="week__title">
        {t.daily.title(days.length)}
      </h2>
      <ol className="week__list">
        {days.map((day) => {
          const { condition, icon } = describeWeather(day.weatherCode);
          const { left, width } = rangePosition(day.tempMin, day.tempMax, weekMin, weekMax);
          return (
            <li key={day.date} className="day">
              <span className="day__name">
                {formatDay(day.date, today, {
                  locale,
                  todayLabel: t.daily.today,
                  yesterdayLabel: t.daily.yesterday,
                })}
              </span>
              {/* A daily forecast covers the whole day, so always the day-time icon. */}
              <WeatherIcon icon={icon} isDay />
              <span className="day__label">
                {t.conditions[condition]}
                {day.precipitationProbability !== null && day.precipitationProbability >= 30 && (
                  <span className="day__rain"> {t.daily.rain(percent(day.precipitationProbability))}</span>
                )}
              </span>
              {/* One left-to-right block, so "low ▬ high" matches the cold-to-warm bar in RTL too. */}
              <span className="day__temps">
                <span className="day__min">{deg(Math.round(day.tempMin))}</span>
                <span className="day__bar" aria-hidden="true">
                  <span className="day__range" style={{ left: `${left}%`, width: `${width}%` }} />
                </span>
                <span className="day__max">{deg(Math.round(day.tempMax))}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
