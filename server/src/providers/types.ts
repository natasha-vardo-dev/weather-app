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
  /** Whether the source issues warnings for the place at all. */
  covers(latitude: number, longitude: number): Promise<boolean>;
}

/** A warning as listed for broadcasting: where to find it in full and where it applies. */
export interface BroadcastWarning {
  /** Identifies this version of the warning (its CAP URL). */
  ref: string;
  /** Where it was listed (a country's feed): the notifier warms up per source. */
  source: string;
  expires: string;
  /** Push topic areas: region codes, or grid cells for drawn areas. */
  areas: string[];
}

/** What push notifications need from a warnings source: every warning, not one place's. */
export interface AlertBroadcastSource {
  /** The areas a place belongs to (the first part of its push topics). */
  areasAt(latitude: number, longitude: number): Promise<string[]>;
  /** Every current warning, the sources read this time and the ones that failed (left out). */
  listWarnings(): Promise<{ warnings: BroadcastWarning[]; read: string[]; failed: string[] }>;
  /** The warning in full; `replaces` names the earlier versions an update supersedes. */
  loadWarning(ref: string): Promise<(ProviderAlert & { replaces: string[] }) | null>;
}

export interface PushMessage {
  topic: string;
  data: Record<string, string>;
  /** How long the push service may hold it for an offline device: until the warning ends. */
  ttlSeconds: number;
}

/**
 * Delivers push notifications by topic. The push service (Firebase Cloud Messaging) keeps
 * which device is on which topic, so this server stores nothing.
 */
export interface PushSender {
  subscribe(token: string, topics: string[]): Promise<void>;
  unsubscribe(token: string, topics: string[]): Promise<void>;
  /**
   * Resolves to how many messages were accepted, and how many refused for good (they would
   * fail the same way again); rejects when a retry could succeed.
   */
  send(messages: PushMessage[]): Promise<{ accepted: number; rejected: number }>;
}
