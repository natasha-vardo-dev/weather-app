import type { AirQuality, Forecast, Location, PlaceName } from '@weather/shared';

export type { AirQuality, CurrentWeather, DailyForecast, Forecast, Location } from '@weather/shared';

/**
 * Any weather data source must implement this interface.
 * Server-only: clients never depend on where the data comes from.
 */
export interface WeatherProvider {
  /** `language`: ISO 639-1 code for place and country names. */
  searchLocations(query: string, limit: number, language: string): Promise<Location[]>;
  /** One place by its provider id, with names in `language`; null if the id is unknown. */
  getLocation(id: number, language: string): Promise<Location | null>;
  getForecast(latitude: number, longitude: number, days: number): Promise<Forecast>;
  getAirQuality(latitude: number, longitude: number): Promise<AirQuality>;
}

/**
 * Names for coordinates (reverse geocoding). Separate from WeatherProvider: Open-Meteo has
 * no reverse geocoding, so this comes from another service and can be swapped on its own.
 */
export interface ReverseGeocoder {
  /** `language`: ISO 639-1 code for the names; null when there is no place there (sea). */
  reverse(latitude: number, longitude: number, language: string): Promise<PlaceName | null>;
}

/**
 * Approximate position from an IP address: the fallback when the browser can't give one.
 * Separate interface, so the service (and its terms) can be swapped on its own.
 */
export interface IpLocator {
  /** `ip`: the user's public address; null means the caller's own (local development). */
  locate(ip: string | null): Promise<{ latitude: number; longitude: number } | null>;
}
