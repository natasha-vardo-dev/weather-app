export type TemperatureUnit = 'celsius' | 'fahrenheit';

export const TEMPERATURE_UNITS: readonly TemperatureUnit[] = ['celsius', 'fahrenheit'];

/** Regions that use Fahrenheit for everyday weather (CLDR "temperature" preference). */
const FAHRENHEIT_REGIONS = new Set(['US', 'BS', 'BZ', 'KY', 'PW', 'LR', 'MH', 'FM']);

/**
 * IANA time zones of those regions (canonical names and the aliases browsers still report).
 * Canada, Mexico and the rest of the Americas have zones of their own, so they stay out.
 */
const FAHRENHEIT_TIME_ZONES = new Set([
  // United States
  'America/New_York', 'America/Detroit', 'America/Chicago', 'America/Menominee', 'America/Denver',
  'America/Boise', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'America/Juneau',
  'America/Sitka', 'America/Metlakatla', 'America/Yakutat', 'America/Nome', 'America/Adak',
  'Pacific/Honolulu', 'America/Indianapolis', 'America/Fort_Wayne', 'America/Louisville',
  'America/Knox_IN', 'America/Shiprock', 'America/Atka', 'Navajo',
  'EST5EDT', 'CST6CDT', 'MST7MDT', 'PST8PDT',
  // Bahamas, Belize, Cayman Islands, Palau, Liberia, Marshall Islands, Micronesia
  'America/Nassau', 'America/Belize', 'America/Cayman', 'Pacific/Palau', 'Africa/Monrovia',
  'Pacific/Majuro', 'Pacific/Kwajalein', 'Kwajalein', 'Pacific/Chuuk', 'Pacific/Truk', 'Pacific/Yap',
  'Pacific/Pohnpei', 'Pacific/Ponape', 'Pacific/Kosrae',
]);
const FAHRENHEIT_TIME_ZONE_PREFIXES = ['US/', 'America/Indiana/', 'America/Kentucky/', 'America/North_Dakota/'];

function isFahrenheitTimeZone(timeZone: string): boolean {
  return FAHRENHEIT_TIME_ZONES.has(timeZone) || FAHRENHEIT_TIME_ZONE_PREFIXES.some((p) => timeZone.startsWith(p));
}

/** Converts a temperature from Celsius. Round after converting, never before. */
export function convertTemperature(celsius: number, unit: TemperatureUnit): number {
  return unit === 'fahrenheit' ? (celsius * 9) / 5 + 32 : celsius;
}

/**
 * Region of a language tag: "en-US" -> "US", "zh-Hant-TW" -> "TW", "es-419" -> "419".
 * Stops at extensions ("-u-…"), so "en-u-ca-gregory" has no region.
 */
export function regionOf(tag: string): string | undefined {
  for (const subtag of tag.split(/[-_]/).slice(1)) {
    if (subtag.length === 1) return undefined;
    if (/^([a-z]{2}|\d{3})$/i.test(subtag)) return subtag.toUpperCase();
  }
  return undefined;
}

/**
 * Default unit: Fahrenheit only when both the first preferred locale (e.g.
 * `navigator.languages[0]`) and the device's time zone point to the US or another Fahrenheit
 * region; Celsius otherwise, and whenever either is missing. The locale alone misleads:
 * "en-US" is the default English of many browsers (Safari on a Mac reports it whatever the
 * system region), so people in Warsaw got Fahrenheit. The time zone is the one other hint a
 * page gets without asking. Only a default: the user can switch.
 */
export function defaultTemperatureUnit(locales: readonly string[], timeZone: string | undefined): TemperatureUnit {
  const region = locales[0] ? regionOf(locales[0]) : undefined;
  const fahrenheit = !!region && FAHRENHEIT_REGIONS.has(region) && !!timeZone && isFahrenheitTimeZone(timeZone);
  return fahrenheit ? 'fahrenheit' : 'celsius';
}
