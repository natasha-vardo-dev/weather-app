export type TemperatureUnit = 'celsius' | 'fahrenheit';

export const TEMPERATURE_UNITS: readonly TemperatureUnit[] = ['celsius', 'fahrenheit'];

/** Regions that use Fahrenheit for everyday weather (CLDR "temperature" preference). */
const FAHRENHEIT_REGIONS = new Set(['US', 'BS', 'BZ', 'KY', 'PW', 'LR', 'MH', 'FM']);

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
 * Default unit from the user's first preferred locale (e.g. `navigator.languages[0]`):
 * Fahrenheit in the US and a few other regions, Celsius everywhere else and when
 * the locale has no region ("en"). Only a default: the user can switch.
 */
export function defaultTemperatureUnit(locales: readonly string[]): TemperatureUnit {
  const region = locales[0] ? regionOf(locales[0]) : undefined;
  return region && FAHRENHEIT_REGIONS.has(region) ? 'fahrenheit' : 'celsius';
}
