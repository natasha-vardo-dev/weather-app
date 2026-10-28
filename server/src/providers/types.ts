import type { AirQuality, AlertLevel, AlertType, Forecast, Location, PlaceName } from '@weather/shared';

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

/** A warning's wording in one language, as the issuer wrote it. */
export interface AlertText {
  /** BCP 47, e.g. "pl-PL", "en-GB". */
  language: string;
  event: string;
  headline?: string;
  description?: string;
  instruction?: string;
  sender?: string;
  web?: string;
}

/** One official warning with its texts in every language the issuer gave. */
export interface ProviderAlert {
  id: string;
  level: AlertLevel;
  type: AlertType;
  onset: string;
  expires: string;
  texts: AlertText[];
}

/**
 * Official weather warnings for a place. Separate from WeatherProvider: Open-Meteo has
 * none, they come from national weather services (MeteoAlarm in Europe; the US National
 * Weather Service would be another implementation).
 */
export interface AlertsProvider {
  /** Who to credit next to the warnings. */
  readonly attribution: { name: string; url: string };
  /** Warnings at the place that have not expired; [] where the source has no coverage. */
  getAlerts(latitude: number, longitude: number): Promise<ProviderAlert[]>;
}
