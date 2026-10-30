/**
 * Rules behind the detail tiles: which band a value is in and what short explanation goes
 * with it. Plain functions, the same on every platform; the words are the clients'.
 */

/** WHO UV index bands. */
export type UvLevel = 'low' | 'moderate' | 'high' | 'very-high' | 'extreme';

export function uvLevel(uv: number): UvLevel {
  const value = Math.round(uv);
  if (value <= 2) return 'low';
  if (value <= 5) return 'moderate';
  if (value <= 7) return 'high';
  if (value <= 10) return 'very-high';
  return 'extreme';
}

/** From "moderate" on, the WHO advises sun protection. */
export const UV_PROTECTION_FROM = 3;

/** "YYYY-MM-DDTHH:mm" local time plus one hour, same format (no time zone involved). */
export function nextHour(time: string): string {
  return new Date(Date.parse(`${time}:00Z`) + 3600_000).toISOString().slice(0, 16);
}

/**
 * When sun protection is needed in the hours given (the next 24): from the first hour at
 * UV_PROTECTION_FROM or above to the end of that run. Null when it never gets there.
 * Times are local "YYYY-MM-DDTHH:mm"; `until` is the end of the last such hour, or null when
 * the run reaches the last hour given: it goes on past the data, and an end there would be
 * wrong (cloudy this afternoon, so the window is tomorrow's, cut at the strip's end).
 */
export function uvProtectionWindow(
  hours: { time: string; uvIndex?: number | null }[],
): { from: string; until: string | null } | null {
  const high = (hour: { uvIndex?: number | null }) => Math.round(hour.uvIndex ?? 0) >= UV_PROTECTION_FROM;
  const start = hours.findIndex(high);
  if (start === -1) return null;
  let end = start;
  while (end + 1 < hours.length && high(hours[end + 1]!)) end++;
  return { from: hours[start]!.time, until: end === hours.length - 1 ? null : nextHour(hours[end]!.time) };
}

export type PressureTrend = 'rising' | 'falling' | 'steady';

/** How many hours ahead the trend looks, and the change that counts as one. */
export const PRESSURE_TREND_HOURS = 3;
export const PRESSURE_TREND_HPA = 1;

/**
 * Whether pressure is rising or falling over the next PRESSURE_TREND_HOURS: falling pressure
 * often brings worse weather, which is what people read a barometer for. Null without data.
 */
export function pressureTrend(hours: { pressure?: number | null }[]): PressureTrend | null {
  const now = hours[0]?.pressure;
  const later = hours[PRESSURE_TREND_HOURS]?.pressure;
  if (typeof now !== 'number' || typeof later !== 'number') return null;
  const change = later - now;
  if (change >= PRESSURE_TREND_HPA) return 'rising';
  if (change <= -PRESSURE_TREND_HPA) return 'falling';
  return 'steady';
}

/** Visibility bands, in metres: fog under 1 km (the meteorological definition), haze or mist under 4 km. */
export type VisibilityLevel = 'fog' | 'poor' | 'moderate' | 'good';

export function visibilityLevel(metres: number): VisibilityLevel {
  if (metres < 1000) return 'fog';
  if (metres < 4000) return 'poor';
  if (metres < 10_000) return 'moderate';
  return 'good';
}

/**
 * How the air feels by its dew point (°C): a better measure of "muggy" than relative
 * humidity, which depends on the temperature (90% on a cold morning is not muggy at all).
 * "Fresh", not "dry", for the lowest band: next to "74%" humidity, "dry" read as a mistake.
 */
export type DewPointComfort = 'fresh' | 'comfortable' | 'humid' | 'muggy';

export function dewPointComfort(celsius: number): DewPointComfort {
  if (celsius < 10) return 'fresh';
  if (celsius < 16) return 'comfortable';
  if (celsius < 21) return 'humid';
  return 'muggy';
}

export interface SunEvent {
  event: 'sunrise' | 'sunset';
  /** Local "YYYY-MM-DDTHH:mm". */
  time: string;
}

/**
 * The next sunrise or sunset after `now` (local "YYYY-MM-DDTHH:mm", like the forecast's
 * times), and the one after it: the tile leads with what comes next. Days without one
 * (polar day or night) are skipped. Null when no times are known.
 */
export function nextSunEvents(
  now: string,
  days: { sunrise?: string | null; sunset?: string | null }[],
): [SunEvent, SunEvent | null] | null {
  const events: SunEvent[] = days.flatMap((day) => [
    ...(day.sunrise ? [{ event: 'sunrise' as const, time: day.sunrise }] : []),
    ...(day.sunset ? [{ event: 'sunset' as const, time: day.sunset }] : []),
  ]);
  // Same fixed-width format, so comparing the strings compares the times.
  const next = events.findIndex((e) => e.time > now);
  if (next === -1) return null;
  return [events[next]!, events[next + 1] ?? null];
}

/**
 * Sunrises and sunsets inside the hourly strip's hours, by the index of the hour each falls
 * in (shown after it). Only those after `now`, as with nextSunEvents: the first hour is
 * "Now", and a sunset earlier in it has already happened. The last hour runs to its end.
 * Times are local "YYYY-MM-DDTHH:mm", so comparing the strings compares the times.
 */
export function sunEventsAfter(
  hours: { time: string }[],
  days: { sunrise?: string | null; sunset?: string | null }[],
  now = '',
): Map<number, SunEvent[]> {
  const after = new Map<number, SunEvent[]>();
  const events: SunEvent[] = days.flatMap((day) => [
    ...(day.sunrise ? [{ event: 'sunrise' as const, time: day.sunrise }] : []),
    ...(day.sunset ? [{ event: 'sunset' as const, time: day.sunset }] : []),
  ]);
  for (const event of events) {
    if (event.time <= now) continue;
    const i = hours.findIndex((hour, j) => hour.time <= event.time && (hours[j + 1]?.time ?? nextHour(hour.time)) > event.time);
    if (i !== -1) after.set(i, [...(after.get(i) ?? []), event]);
  }
  return after;
}
