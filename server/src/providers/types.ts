import type { Forecast, Location } from '@weather/shared';

export type { CurrentWeather, DailyForecast, Forecast, Location } from '@weather/shared';

/**
 * Any weather data source must implement this interface.
 * Server-only: clients never depend on where the data comes from.
 */
export interface WeatherProvider {
  /** `language`: ISO 639-1 code for place and country names. */
  searchLocations(query: string, limit: number, language: string): Promise<Location[]>;
  getForecast(latitude: number, longitude: number, days: number): Promise<Forecast>;
}
