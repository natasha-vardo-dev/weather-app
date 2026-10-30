/**
 * When a warning starts or ends, as people at the place say it: "today 20:00",
 * "tomorrow 10:00", "Thu 06:00". In the place's own time zone (a warning for Lisbon read
 * in Warsaw keeps Lisbon's hours, like the rest of the page). "Today" and "tomorrow" come
 * from Intl.RelativeTimeFormat, so every language has them without translations.
 */

/** Calendar date (YYYY-MM-DD) of an instant in a time zone. */
function dateIn(instant: number, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    instant,
  );
}

/** Whole days between the dates of two instants at the place (DST does not matter for dates). */
function dayOffset(instant: number, now: number, timeZone: string | undefined): number {
  return Math.round((Date.parse(dateIn(instant, timeZone)) - Date.parse(dateIn(now, timeZone))) / 86_400_000);
}

export function formatAlertTime(iso: string, options: { locale: string; timeZone?: string; now?: number }): string {
  const { locale, timeZone, now = Date.now() } = options;
  const instant = Date.parse(iso);
  // Intl throws on an invalid date; one bad upstream warning must not break the page.
  if (!Number.isFinite(instant)) return '';
  // Like the hourly strip (formatHour): "06:00" where the clock is 24-hour, "6:00 AM" where it is 12-hour.
  const { hour12 } = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions();
  const time = new Intl.DateTimeFormat(locale, {
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(instant);
  const offset = dayOffset(instant, now, timeZone);
  const day =
    offset >= -1 && offset <= 1
      ? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(offset, 'day')
      : new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone }).format(instant);
  return `${day} ${time}`;
}
