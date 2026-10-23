import type { Forecast, Location, WeatherProvider } from '../providers/types.js';
import { TtlCache } from './cache.js';

export class WeatherService {
  private readonly forecastCache: TtlCache<Forecast>;
  private readonly locationCache: TtlCache<Location[]>;

  constructor(
    private readonly provider: WeatherProvider,
    forecastTtlMs = 10 * 60 * 1000,
  ) {
    this.forecastCache = new TtlCache(forecastTtlMs);
    // City search results change very rarely, so they can live longer.
    this.locationCache = new TtlCache(24 * 60 * 60 * 1000);
  }

  async searchLocations(query: string, limit = 5): Promise<Location[]> {
    const key = `${query.trim().toLowerCase()}:${limit}`;
    const cached = this.locationCache.get(key);
    if (cached) return cached;

    const locations = await this.provider.searchLocations(query.trim(), limit);
    this.locationCache.set(key, locations);
    return locations;
  }

  async getForecast(latitude: number, longitude: number, days = 7): Promise<Forecast> {
    // ~1 km precision: nearby requests share one cache entry.
    const key = `${latitude.toFixed(2)}:${longitude.toFixed(2)}:${days}`;
    const cached = this.forecastCache.get(key);
    if (cached) return cached;

    const forecast = await this.provider.getForecast(latitude, longitude, days);
    this.forecastCache.set(key, forecast);
    return forecast;
  }
}
