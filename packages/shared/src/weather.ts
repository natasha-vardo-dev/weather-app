/**
 * Which picture to show. Names, not components: each platform (web, React Native)
 * maps them to its own icons. Clear and partly cloudy also need day/night from the data.
 */
export type WeatherIcon = 'clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

/**
 * What the weather is, as a key. Each client translates it into its own language,
 * so the API and this package stay language-neutral.
 */
export type WeatherCondition =
  | 'clear-sky'
  | 'mostly-clear'
  | 'partly-cloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'rain-showers'
  | 'snow-showers'
  | 'thunderstorm'
  | 'unknown';

/** WMO weather interpretation codes. */
export function describeWeather(code: number): { condition: WeatherCondition; icon: WeatherIcon } {
  if (code === 0) return { condition: 'clear-sky', icon: 'clear' };
  if (code === 1) return { condition: 'mostly-clear', icon: 'clear' };
  if (code === 2) return { condition: 'partly-cloudy', icon: 'partly-cloudy' };
  if (code === 3) return { condition: 'overcast', icon: 'cloudy' };
  if (code === 45 || code === 48) return { condition: 'fog', icon: 'fog' };
  if (code >= 51 && code <= 57) return { condition: 'drizzle', icon: 'drizzle' };
  if (code >= 61 && code <= 67) return { condition: 'rain', icon: 'rain' };
  if (code >= 71 && code <= 77) return { condition: 'snow', icon: 'snow' };
  if (code >= 80 && code <= 82) return { condition: 'rain-showers', icon: 'rain' };
  if (code === 85 || code === 86) return { condition: 'snow-showers', icon: 'snow' };
  if (code >= 95) return { condition: 'thunderstorm', icon: 'storm' };
  return { condition: 'unknown', icon: 'cloudy' };
}

/**
 * Position of a day's temperature range within the whole week's range,
 * as percentages (left offset and width).
 */
export function rangePosition(min: number, max: number, weekMin: number, weekMax: number) {
  const span = weekMax - weekMin || 1;
  const left = ((min - weekMin) / span) * 100;
  const width = Math.max(((max - min) / span) * 100, 4);
  return { left: Math.min(left, 100 - width), width };
}

export interface TemperatureTrend {
  trend: 'warmer' | 'cooler' | 'same';
  /** Whole degrees, always positive (0 for 'same'). */
  difference: number;
}

/**
 * Compares today's high with yesterday's high. Highs, not the current temperature:
 * in the morning "now" is always colder than yesterday's peak.
 * Uses rounded values so the text matches the temperatures shown on screen.
 */
export function compareWithYesterday(todayMax: number, yesterdayMax: number): TemperatureTrend {
  const delta = Math.round(todayMax) - Math.round(yesterdayMax);
  if (delta === 0) return { trend: 'same', difference: 0 };
  return { trend: delta > 0 ? 'warmer' : 'cooler', difference: Math.abs(delta) };
}

export interface FormatHourOptions {
  locale?: string;
  nowLabel?: string;
}

/**
 * "Now" for the first hour, local clock time for the rest ("16:00", "4:00 PM").
 * `time` is already local to the place, so it is formatted as UTC: no timezone shift.
 */
export function formatHour(time: string, index: number, options: FormatHourOptions = {}): string {
  const { locale = 'en-GB', nowLabel = 'Now' } = options;
  if (index === 0) return nowLabel;
  return hourFormat(locale).format(new Date(`${time}:00Z`));
}

/** Building Intl formatters is costly and the hourly strip formats 24 times: one per locale. */
const hourFormats = new Map<string, Intl.DateTimeFormat>();

function hourFormat(locale: string): Intl.DateTimeFormat {
  let format = hourFormats.get(locale);
  if (!format) {
    // 24-hour locales write "00:00", 12-hour ones "4:00 PM" without a leading zero.
    const { hour12 } = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions();
    format = new Intl.DateTimeFormat(locale, {
      hour: hour12 ? 'numeric' : '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
    hourFormats.set(locale, format);
  }
  return format;
}

export interface FormatDayOptions {
  locale?: string;
  todayLabel?: string;
  yesterdayLabel?: string;
}

/** Previous calendar date for a YYYY-MM-DD string. UTC math avoids DST shifts. */
function previousDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * "Today" / "Yesterday" relative to `today` (YYYY-MM-DD in the place's timezone),
 * short weekday name for other days.
 */
export function formatDay(date: string, today: string, options: FormatDayOptions = {}): string {
  const { locale = 'en-GB', todayLabel = 'Today', yesterdayLabel = 'Yesterday' } = options;
  if (date === today) return todayLabel;
  if (date === previousDate(today)) return yesterdayLabel;
  const weekday = new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, {
    weekday: 'short',
    timeZone: 'UTC',
  });
  // Some languages abbreviate in lower case ("сб", "sam."); a list label starts with a capital.
  return weekday.charAt(0).toLocaleUpperCase(locale) + weekday.slice(1);
}

/** At or below this chance, no chance of rain is shown: the hourly strip and the 10-day list alike. */
export const PRECIPITATION_LIKELY = 30;

/**
 * Past this age the city page says the forecast is old. Fresh data is up to ~40 minutes
 * behind: the provider's current weather is per 15 minutes, the server keeps it 15 (and 5
 * more while refreshing), browsers 5. So 60 means something went wrong: the provider was
 * down and the server answered with what it had (up to an hour), or the page stayed open.
 * (45 while the server kept forecasts 10 minutes: with 15 it would have shown on fresh data.)
 */
export const FORECAST_OUTDATED_MINUTES = 60;

/** Building Intl formatters is costly, and the age is checked every minute: one per time zone. */
const zoneClocks = new Map<string, Intl.DateTimeFormat>();

/**
 * The instant (ms) of a local time at a place ("2026-10-30T14:15" in its time zone), or null
 * if the time or the zone is not readable. Through the zone's offset at that time, so it is
 * right across daylight-saving changes; asked twice, since the first guess may sit on the
 * other side of a change. A time the spring change skips lands an hour off, harmlessly.
 */
export function placeTimeToInstant(localTime: string, timeZone: string): number | null {
  let clock = zoneClocks.get(timeZone);
  try {
    if (!clock) {
      clock = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      });
      zoneClocks.set(timeZone, clock);
    }
  } catch {
    return null;
  }
  const zone = clock;
  // The wall-clock time at the place for an instant, written as if it were UTC.
  const wallClock = (instant: number) => {
    const parts = zone.formatToParts(instant);
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
    return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
  };
  // Checked first: Date.parse reads almost anything ("not a time:00Z" is a date in V8).
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localTime) ? Date.parse(`${localTime}:00Z`) : NaN;
  if (!Number.isFinite(local)) return null;
  let instant = local - (wallClock(local) - local);
  instant = local - (wallClock(instant) - instant);
  return Number.isFinite(instant) ? instant : null;
}

/**
 * Minutes from the forecast's current weather (`current.time`, the place's local time) to
 * now. 0 if the time zone or the time is not readable: better no warning than a wrong one.
 * From the data's instant, not two wall-clock times: those were an hour off across a
 * daylight-saving change (at 03:00 on the spring night, data from 01:45 read 75 minutes old
 * after 15). (Found by roborev.)
 */
export function forecastAgeMinutes(currentTime: string, timeZone: string, now: Date = new Date()): number {
  const instant = placeTimeToInstant(currentTime, timeZone);
  if (instant === null) return 0;
  return Math.max(Math.round((now.getTime() - instant) / 60_000), 0);
}
