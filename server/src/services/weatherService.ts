import { FORECAST_DEFAULT_DAYS } from '@weather/shared';
import type { AirQuality, Forecast, Location, WeatherProvider } from '../providers/types.js';
import { TtlCache, type CacheStats } from './cache.js';

export class WeatherService {
  private readonly forecastCache: TtlCache<Forecast>;
  private readonly locationCache: TtlCache<Location[]>;
  private readonly airQualityCache: TtlCache<AirQuality>;
  /** null caches "unknown id" too, so a bad id does not hit the provider every time. */
  private readonly locationByIdCache: TtlCache<Location | null>;

  constructor(
    private readonly provider: WeatherProvider,
    forecastTtlMs = 10 * 60 * 1000,
  ) {
    this.forecastCache = new TtlCache(forecastTtlMs);
    // City search results change very rarely, so they can live longer.
    this.locationCache = new TtlCache(24 * 60 * 60 * 1000);
    // The provider updates air quality hourly, so it can live longer than forecasts.
    this.airQualityCache = new TtlCache(30 * 60 * 1000);
    this.locationByIdCache = new TtlCache(24 * 60 * 60 * 1000);
  }

  searchLocations(query: string, limit = 5, language = 'en'): Promise<Location[]> {
    // The language changes the returned names, so it is part of the key.
    const key = `${language}:${query.trim().toLowerCase()}:${limit}`;
    return this.locationCache.getOrLoad(key, () => this.provider.searchLocations(query.trim(), limit, language));
  }

  getForecast(latitude: number, longitude: number, days = FORECAST_DEFAULT_DAYS): Promise<Forecast> {
    // ~1 km precision: nearby requests share one cache entry.
    const key = `${latitude.toFixed(2)}:${longitude.toFixed(2)}:${days}`;
    return this.forecastCache.getOrLoad(key, () => this.provider.getForecast(latitude, longitude, days));
  }

  /** Place names change only when the provider's data does, so they share the search TTL. */
  getLocation(id: number, language = 'en'): Promise<Location | null> {
    const key = `id:${language}:${id}`;
    return this.locationByIdCache.getOrLoad(key, () => this.provider.getLocation(id, language));
  }

  getAirQuality(latitude: number, longitude: number): Promise<AirQuality> {
    // Same ~1 km rounding as forecasts.
    const key = `${latitude.toFixed(2)}:${longitude.toFixed(2)}`;
    return this.airQualityCache.getOrLoad(key, () => this.provider.getAirQuality(latitude, longitude));
  }

  cacheStats(): Record<string, CacheStats> {
    return {
      forecast: this.forecastCache.stats(),
      search: this.locationCache.stats(),
      locationById: this.locationByIdCache.stats(),
      airQuality: this.airQualityCache.stats(),
    };
  }
}
