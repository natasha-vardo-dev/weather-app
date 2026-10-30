import type { CacheStats } from '../services/cache.js';
import type { Logger } from './logger.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A provider's published limits; omitted windows have none. */
export interface ProviderLimits {
  perMinute?: number;
  perHour?: number;
  perDay?: number;
}

/** Open-Meteo's free tier, shared by forecast, geocoding and air quality (per IP of the server). */
export const OPEN_METEO_LIMITS: ProviderLimits = { perMinute: 600, perHour: 5000, perDay: 10_000 };

/** Share of a limit after which a warning is logged, once per window. */
const WARN_AT = 0.8;

const WINDOWS = [
  { name: 'perMinute', ms: MINUTE },
  { name: 'perHour', ms: HOUR },
  { name: 'perDay', ms: DAY },
] as const;

export interface ProviderUsage {
  lastMinute: number;
  lastHour: number;
  lastDay: number;
  /** Failed calls (HTTP errors, timeouts, network) in the last day. */
  errorsLastDay: number;
  limits: ProviderLimits;
  /** Usage of each limit, 0–1: what to watch. */
  share: Partial<Record<keyof ProviderLimits, number>>;
}

/**
 * Calls to one provider, counted per minute for the last day: enough to compare with its
 * limits per minute, hour and day. 1,440 small buckets, whatever the traffic.
 */
class ProviderCounter {
  private readonly calls = new Map<number, { calls: number; errors: number }>();
  private readonly warnedAt: Partial<Record<keyof ProviderLimits, number>> = {};

  constructor(
    readonly name: string,
    readonly limits: ProviderLimits,
  ) {}

  record(ok: boolean, now: number, logger: Logger): void {
    const minute = Math.floor(now / MINUTE);
    const bucket = this.calls.get(minute) ?? { calls: 0, errors: 0 };
    bucket.calls += 1;
    if (!ok) bucket.errors += 1;
    this.calls.set(minute, bucket);
    // Buckets older than a day are dropped as new minutes start.
    if (bucket.calls === 1) {
      for (const key of this.calls.keys()) if (key <= minute - DAY / MINUTE) this.calls.delete(key);
    }
    this.warnNearLimits(now, logger);
  }

  usage(now: number): ProviderUsage {
    // A sliding window over minute buckets: the minute the window starts in counts by the share
    // of it still inside. Counting whole buckets only, "the last minute" dropped to zero at each
    // new minute, and a burst across the boundary (400 calls at :50, 400 at :10) never warned.
    // (Found by roborev.)
    const count = (ms: number, field: 'calls' | 'errors') => {
      const start = now - ms;
      const first = Math.floor(start / MINUTE);
      const shareOfFirst = first + 1 - start / MINUTE;
      let total = 0;
      for (const [minute, bucket] of this.calls) {
        if (minute > first) total += bucket[field];
        else if (minute === first) total += bucket[field] * shareOfFirst;
      }
      return Math.round(total);
    };
    const used = { perMinute: count(MINUTE, 'calls'), perHour: count(HOUR, 'calls'), perDay: count(DAY, 'calls') };
    const share: ProviderUsage['share'] = {};
    for (const { name } of WINDOWS) {
      const limit = this.limits[name];
      if (limit) share[name] = Math.round((used[name] / limit) * 1000) / 1000;
    }
    return {
      lastMinute: used.perMinute,
      lastHour: used.perHour,
      lastDay: used.perDay,
      errorsLastDay: count(DAY, 'errors'),
      limits: this.limits,
      share,
    };
  }

  /** Before the provider starts refusing: the limit that bites first is the daily one. */
  private warnNearLimits(now: number, logger: Logger): void {
    const { share } = this.usage(now);
    for (const { name, ms } of WINDOWS) {
      const used = share[name];
      if (used === undefined || used < WARN_AT) continue;
      const last = this.warnedAt[name];
      if (last !== undefined && now - last < ms) continue;
      this.warnedAt[name] = now;
      logger.warn(
        { provider: this.name, window: name, share: used, limit: this.limits[name] },
        'provider usage near limit',
      );
    }
  }
}

export interface MetricsSnapshot {
  uptimeSeconds: number;
  requests: Record<'2xx' | '3xx' | '4xx' | '5xx', number>;
  rateLimited: number;
  providers: Record<string, ProviderUsage>;
  caches: Record<string, CacheStats & { hitRate: number | null }>;
}

/**
 * In-memory counters for one instance: cache hits, calls to providers against their limits,
 * rate-limited requests. Lost on restart, which is fine for watching a single small server;
 * with several instances they would go to Prometheus or the host's metrics instead.
 */
export class Metrics {
  private readonly providers = new Map<string, ProviderCounter>();
  private readonly caches = new Map<string, () => CacheStats>();
  private readonly requests = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  private rateLimitedCount = 0;
  private readonly startedAt: number;

  constructor(
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {
    this.startedAt = now();
  }

  /** Calls to a provider are counted under `name`, against `limits`. */
  provider(name: string, limits: ProviderLimits = {}): (ok: boolean) => void {
    let counter = this.providers.get(name);
    if (!counter) {
      counter = new ProviderCounter(name, limits);
      this.providers.set(name, counter);
    }
    const target = counter;
    return (ok) => target.record(ok, this.now(), this.logger);
  }

  /** Reports a cache's stats under `name` (read when a snapshot is taken). */
  cache(name: string, stats: () => CacheStats): void {
    this.caches.set(name, stats);
  }

  request(status: number): void {
    const group = `${Math.min(5, Math.max(2, Math.floor(status / 100)))}xx` as keyof typeof this.requests;
    this.requests[group] += 1;
  }

  rateLimited(): void {
    this.rateLimitedCount += 1;
  }

  snapshot(): MetricsSnapshot {
    const now = this.now();
    const caches: MetricsSnapshot['caches'] = {};
    for (const [name, stats] of this.caches) {
      const s = stats();
      const asked = s.hits + s.misses + s.coalesced;
      // Coalesced requests did not reach the provider either: they count as served from cache.
      caches[name] = { ...s, hitRate: asked ? Math.round(((s.hits + s.coalesced) / asked) * 1000) / 1000 : null };
    }
    const providers: MetricsSnapshot['providers'] = {};
    for (const [name, counter] of this.providers) providers[name] = counter.usage(now);
    return {
      uptimeSeconds: Math.round((now - this.startedAt) / 1000),
      requests: { ...this.requests },
      rateLimited: this.rateLimitedCount,
      providers,
      caches,
    };
  }
}

/**
 * The providers' fetch, counted and logged: every adapter takes a fetch function, so this
 * sees each call to Open-Meteo, Nominatim, ipwho.is and MeteoAlarm without touching them.
 * Logs host and path only (the query has coordinates), at debug level.
 */
export function instrumentFetch(
  name: string,
  record: (ok: boolean) => void,
  logger: Logger,
  fetchFn: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    const started = performance.now();
    const url = new URL(input instanceof Request ? input.url : String(input));
    const where = { provider: name, host: url.host, path: url.pathname };
    try {
      const response = await fetchFn(input, init);
      record(response.ok);
      logger.debug({ ...where, status: response.status, ms: Math.round(performance.now() - started) }, 'provider call');
      return response;
    } catch (err) {
      record(false);
      logger.warn(
        { ...where, ms: Math.round(performance.now() - started), err: (err as Error).name },
        'provider call failed',
      );
      throw err;
    }
  };
}
