import { FORECAST_DEFAULT_DAYS } from '@weather/shared';
import type { Logger } from '../observability/logger.js';
import type { AirQuality, Forecast, Location, WeatherProvider } from '../providers/types.js';
import { staleErrorLogger } from './staleErrorLogger.js';
import { TtlCache, type Cached, type CacheStats } from './cache.js';

const MB = 1024 * 1024;
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const DAY = 24 * HOUR;
/** ~1 km: nearby requests share one entry, and the provider is asked for the same point. */
const round = (degrees: number) => Number(degrees.toFixed(2));
/**
 * Memory is bounded in bytes (JSON size; the objects in memory take about 2–3 times more), so
 * the entry limit is only a guard against many tiny entries. 10% of each TTL taken off at
 * random spreads out entries stored together.
 */
const LIMITS = { maxEntries: 5000, jitter: 0.1 };

export class WeatherService {
  private readonly forecastCache: TtlCache<Forecast>;
  private readonly locationCache: TtlCache<Location[]>;
  private readonly airQualityCache: TtlCache<AirQuality>;
  /** null caches "unknown id" too, so a bad id does not hit the provider every time. */
  private readonly locationByIdCache: TtlCache<Location | null>;

  constructor(
    private readonly provider: WeatherProvider,
    forecastTtlMs = 10 * 60 * 1000,
    logger?: Logger,
    /**
     * Run before each call to the provider (not for cached answers): throws to refuse it when
     * the server is near the provider's limit (Metrics.budget). A refused refresh keeps a
     * stale value where the cache has one.
     */
    private readonly budget: () => void = () => {},
  ) {
    // Past the TTL: 5 more minutes answered at once while a new forecast loads, and up to an
    // hour in all when the provider is down, instead of an error.
    this.forecastCache = new TtlCache(forecastTtlMs, {
      staleWhileRevalidateMs: 5 * MINUTE,
      staleIfErrorMs: Math.max(HOUR - forecastTtlMs, 0),
      onStaleError: staleErrorLogger(logger, 'forecast'),
      ...LIMITS,
      maxBytes: 16 * MB,
    });
    // City search results and names change very rarely: a day fresh, a day more answered at
    // once, a week in all when the provider is down.
    const names = { staleWhileRevalidateMs: DAY, staleIfErrorMs: 6 * DAY, ...LIMITS, maxBytes: 4 * MB };
    this.locationCache = new TtlCache(DAY, { ...names, onStaleError: staleErrorLogger(logger, 'search') });
    this.locationByIdCache = new TtlCache(DAY, { ...names, onStaleError: staleErrorLogger(logger, 'locationById') });
    // The provider updates air quality hourly, so it can live longer than forecasts.
    this.airQualityCache = new TtlCache(30 * MINUTE, {
      staleWhileRevalidateMs: 10 * MINUTE,
      staleIfErrorMs: 90 * MINUTE,
      onStaleError: staleErrorLogger(logger, 'airQuality'),
      ...LIMITS,
      maxBytes: 4 * MB,
    });
  }

  searchLocations(query: string, limit = 5, language = 'en'): Promise<Location[]> {
    // The language changes the returned names, so it is part of the key.
    const key = `${language}:${query.trim().toLowerCase()}:${limit}`;
    return this.locationCache.getOrLoad(key, async () =>
      this.call(() => this.provider.searchLocations(query.trim(), limit, language)),
    );
  }

  /** With `stale`: a stale forecast should be kept by browsers for less long. */
  getForecast(latitude: number, longitude: number, days = FORECAST_DEFAULT_DAYS): Promise<Cached<Forecast>> {
    const [lat, lon] = [round(latitude), round(longitude)];
    return this.forecastCache.load(`${lat}:${lon}:${days}`, async () =>
      this.call(() => this.provider.getForecast(lat, lon, days)),
    );
  }

  /** Place names change only when the provider's data does, so they share the search TTL. */
  getLocation(id: number, language = 'en'): Promise<Location | null> {
    const key = `id:${language}:${id}`;
    return this.locationByIdCache.getOrLoad(key, async () => this.call(() => this.provider.getLocation(id, language)));
  }

  getAirQuality(latitude: number, longitude: number): Promise<Cached<AirQuality>> {
    const [lat, lon] = [round(latitude), round(longitude)];
    return this.airQualityCache.load(`${lat}:${lon}`, async () =>
      this.call(() => this.provider.getAirQuality(lat, lon)),
    );
  }

  /** A provider call, after the budget check. */
  private call<T>(load: () => Promise<T>): Promise<T> {
    this.budget();
    return load();
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
