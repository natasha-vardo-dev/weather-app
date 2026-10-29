import { describeWeather, formatDay, PRECIPITATION_LIKELY, rangePosition, type DailyForecast } from '@weather/shared';
import { useI18n } from '../i18n/I18nProvider';
import { useUnits } from '../units/UnitProvider';
import { WeatherIcon } from './WeatherIcon';

interface Props {
  /** Starts with today in the place's timezone. */
  days: DailyForecast[];
  /** The temperature now, °C: a dot on today's bar shows where the day is between low and high. */
  now?: number;
}

export function ForecastList({ days, now }: Props) {
  const { t, locale, deg, percent } = useI18n();
  const { temp } = useUnits();
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
          const isToday = day.date === today;
          // Decorative: the number itself is at the top of the page.
          const nowAt =
            isToday && now !== undefined && Number.isFinite(now)
              ? Math.min(100, Math.max(0, ((now - weekMin) / (weekMax - weekMin || 1)) * 100))
              : null;
          return (
            <li key={day.date} className={isToday ? 'day day--today' : 'day'}>
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
                {day.precipitationProbability !== null && day.precipitationProbability > PRECIPITATION_LIKELY && (
                  // The space outside the span: the line may break there, but not inside "rain 31%".
                  <>
                    {' '}
                    <span className="day__rain">{t.daily.rain(percent(day.precipitationProbability))}</span>
                  </>
                )}
              </span>
              {/* One left-to-right block, so "low ▬ high" matches the cold-to-warm bar in RTL too. */}
              <span className="day__temps">
                <span className="day__min">{deg(temp(day.tempMin))}</span>
                <span className="day__bar" aria-hidden="true">
                  <span className="day__range" style={{ left: `${left}%`, width: `${width}%` }} />
                  {nowAt !== null && <span className="day__now" style={{ left: `${nowAt}%` }} />}
                </span>
                <span className="day__max">{deg(temp(day.tempMax))}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
