import type { AirQuality, Forecast, Location } from '@weather/shared';

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
