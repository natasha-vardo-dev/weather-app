import {
  describeWeather,
  formatHour,
  sunEventsAfter,
  PRECIPITATION_LIKELY,
  type DailyForecast,
  type HourlyForecast as Hour,
  type SunEvent,
} from '@weather/shared';
import { useI18n } from '../i18n/I18nProvider';
import { useUnits } from '../units/UnitProvider';
import { WeatherIcon } from './WeatherIcon';

interface Props {
  hours: Hour[];
  /** For sunrise and sunset, shown between the hours they fall in. */
  days?: DailyForecast[];
  /** The place's current time: a sunrise or sunset before it is not shown after "Now". */
  now?: string;
}

/** Half a sun on the horizon; the arrow says which way it goes. */
function SunIcon({ event }: { event: SunEvent['event'] }) {
  return (
    <svg className="hour__sun" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 17a6 6 0 0 1 12 0z" />
      <path className="hour__sun-line" d="M3 17h18M12 3v5" />
      <path className="hour__sun-line" d={event === 'sunrise' ? 'M9.5 5.5 12 3l2.5 2.5' : 'M9.5 5.5 12 8l2.5-2.5'} />
    </svg>
  );
}

/**
 * Horizontally scrolling strip for the next 24 hours. The chance of rain shows under the
 * icon only in hours where it is likely. Icon and chance share a slot of one height, so the
 * strip keeps one height whether it rains or not (an empty row that appeared and vanished
 * was why it was left out at first), and in a dry hour the icon sits in the slot's middle
 * instead of over an empty row. Sunrise and sunset get a cell of their own between the hours.
 */
export function HourlyForecast({ hours, days = [], now }: Props) {
  const { t, locale, deg, percent } = useI18n();
  const { temp } = useUnits();
  if (hours.length === 0) return null;
  const sun = sunEventsAfter(hours, days, now);
  const clock = (time: string) => formatHour(time, 1, { locale });

  return (
    // A scrollable region must be focusable, or keyboard users can't scroll it.
    <section className="hours" aria-labelledby="hours-title">
      <h2 id="hours-title" className="hours__title">
        {t.hourly.title(hours.length)}
      </h2>
      <ol className="hours__list" tabIndex={0} aria-labelledby="hours-title">
        {hours.flatMap((hour, i) => {
          const name = formatHour(hour.time, i, { locale, nowLabel: t.hourly.now });
          const temperature = temp(hour.temperature);
          const rain =
            hour.precipitationProbability !== null && hour.precipitationProbability > PRECIPITATION_LIKELY
              ? hour.precipitationProbability
              : null;
          const { condition, icon } = describeWeather(hour.weatherCode);
          const label = t.conditions[condition];
          const cells = [
            <li key={hour.time} className="hour" title={label}>
              {/* Screen readers get one sentence instead of three loose numbers. */}
              <span className="visually-hidden">
                {name}: {t.current.degrees(temperature)}, {label}
                {rain !== null && `, ${t.hourly.rainChance(percent(rain))}`}
              </span>
              <span className="hour__time" aria-hidden="true">
                {name}
              </span>
              {/* Icon and chance share one fixed-height slot: without a chance the icon sits
                  in its middle, so a dry hour has no empty row under it. */}
              <span className="hour__sky">
                <WeatherIcon icon={icon} isDay={hour.isDay} />
                {rain !== null && (
                  <span className="hour__rain" aria-hidden="true">
                    {percent(rain)}
                  </span>
                )}
              </span>
              <span className="hour__temp" aria-hidden="true">
                {deg(temperature)}
              </span>
            </li>,
          ];
          for (const event of sun.get(i) ?? []) {
            const word = t.tiles[event.event];
            const time = clock(event.time);
            cells.push(
              <li key={`${event.event}-${event.time}`} className="hour hour--sun">
                <span className="visually-hidden">
                  {word} {time}
                </span>
                <span className="hour__time" aria-hidden="true">
                  {time}
                </span>
                <span className="hour__sky">
                  <SunIcon event={event.event} />
                </span>
                <span className="hour__event" aria-hidden="true">
                  {word}
                </span>
              </li>,
            );
          }
          return cells;
        })}
      </ol>
    </section>
  );
}
