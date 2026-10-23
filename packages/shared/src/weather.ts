export type Sky = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

/** WMO weather interpretation codes. */
export function describeWeather(code: number): { label: string; sky: Sky } {
  if (code === 0) return { label: 'Clear sky', sky: 'clear' };
  if (code === 1) return { label: 'Mostly clear', sky: 'clear' };
  if (code === 2) return { label: 'Partly cloudy', sky: 'cloudy' };
  if (code === 3) return { label: 'Overcast', sky: 'cloudy' };
  if (code === 45 || code === 48) return { label: 'Fog', sky: 'fog' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', sky: 'rain' };
  if (code >= 61 && code <= 67) return { label: 'Rain', sky: 'rain' };
  if (code >= 71 && code <= 77) return { label: 'Snow', sky: 'snow' };
  if (code >= 80 && code <= 82) return { label: 'Rain showers', sky: 'rain' };
  if (code === 85 || code === 86) return { label: 'Snow showers', sky: 'snow' };
  if (code >= 95) return { label: 'Thunderstorm', sky: 'storm' };
  return { label: 'Unknown', sky: 'cloudy' };
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

/** "Now" for the first hour, "HH:mm" for the rest. Reads the string, so no timezone conversion. */
export function formatHour(time: string, index: number, nowLabel = 'Now'): string {
  return index === 0 ? nowLabel : time.slice(11, 16);
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
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, {
    weekday: 'short',
    timeZone: 'UTC',
  });
}
