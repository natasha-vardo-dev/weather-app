import { BusyError } from '../errors.js';
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

/**
 * Open-Meteo's free tier, shared by forecast, geocoding and air quality (per IP of the server),
 * in its own units: a request can count as more than one call (openMeteoWeight).
 */
export const OPEN_METEO_LIMITS: ProviderLimits = { perMinute: 600, perHour: 5000, perDay: 10_000 };

/**
 * How many calls Open-Meteo counts a request as. Its pricing FAQ: "Requests for data covering
 * more than 10 weather variables or extending over a period of more than 2 weeks for a single
 * location are considered multiple API calls", in fractions: "2 weeks of data with 15 weather
 * variables will be calculated as 1.5 API calls, while 4 weeks of data equals 3.0". So
 * variables / 10 times days / 14, each at least 1 (the product fits both examples; no closed
 * formula is published). Our forecast asks for 22 variables over 11 days: 2.2 calls (26 and 2.6 before
 * the duplicates with the hourly data were dropped; a test checks the adapter's own URL), so
 * counting requests only, the budget would let through more than twice the limit. Requests
 * without variables (geocoding) count as 1. Whether air quality is weighted the same way is
 * not stated; it is counted the same, the safe side. (Found by roborev.)
 */
export function openMeteoWeight(url: URL): number {
  const variables = ['current', 'hourly', 'daily', 'minutely_15']
    .map((name) => url.searchParams.get(name))
    .filter((list): list is string => !!list)
    .reduce((total, list) => total + list.split(',').filter(Boolean).length, 0);
  const days =
    Number(url.searchParams.get('forecast_days') ?? (variables > 0 ? 7 : 0)) +
    Number(url.searchParams.get('past_days') ?? 0);
  const weight = Math.max(1, variables / 10) * Math.max(1, days / 14);
  return Number.isFinite(weight) ? weight : 1;
}

/**
 * Not a published limit: our own cap on ipwho.is ("low, non-commercial traffic"). Its lookups
 * are cached a day per address, so real users make few; the cap is for a script sending a
 * new forged address with every request (see the proxy secret in app.ts).
 */
export const IPWHOIS_LIMITS: ProviderLimits = { perMinute: 30, perDay: 1000 };

/** Share of a limit after which a warning is logged, once per window. */
const WARN_AT = 0.8;

/**
 * Share of a limit after which new calls are refused (BusyError) until the window moves on.
 * Per-IP limits stop one address, not many, nor an address forged past the proxies; this
 * keeps the provider's own limit (and its goodwill) for everyone. 10% is left for calls
 * already under way when the share is crossed.
 */
export const BUDGET_SHARE = 0.9;

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
  /** Calls refused because a limit was near (BUDGET_SHARE), since the start. */
  refused: number;
}

/**
 * Calls to one provider, counted per minute for the last day: enough to compare with its
 * limits per minute, hour and day. 1,440 small buckets, whatever the traffic.
 */
class ProviderCounter {
  private readonly calls = new Map<number, { calls: number; errors: number }>();
  private readonly warnedAt: Partial<Record<keyof ProviderLimits, number>> = {};
  private refusedCount = 0;
  private lastRefusalLog = -Infinity;

  constructor(
    readonly name: string,
    readonly limits: ProviderLimits,
  ) {}

  /** `weight`: how many calls the provider counts this request as (1 unless it says otherwise). */
  record(ok: boolean, now: number, logger: Logger, weight = 1): void {
    const minute = Math.floor(now / MINUTE);
    const fresh = !this.calls.has(minute);
    const bucket = this.calls.get(minute) ?? { calls: 0, errors: 0 };
    bucket.calls += weight;
    if (!ok) bucket.errors += 1;
    this.calls.set(minute, bucket);
    // Buckets older than a day are dropped as new minutes start.
    if (fresh) {
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
      refused: this.refusedCount,
    };
  }

  /** Throws BusyError when a limit is at BUDGET_SHARE; logged at most once a minute. */
  checkBudget(now: number, logger: Logger): void {
    const { share } = this.usage(now);
    const full = WINDOWS.find(({ name }) => (share[name] ?? 0) >= BUDGET_SHARE);
    if (!full) return;
    this.refusedCount += 1;
    if (now - this.lastRefusalLog >= MINUTE) {
      this.lastRefusalLog = now;
      logger.warn(
        { provider: this.name, window: full.name, share: share[full.name], refused: this.refusedCount },
        'provider budget reached, refusing new calls',
      );
    }
    throw new BusyError();
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
  /** Error reports from browsers (/api/client-errors), since the start. */
  clientErrors: number;
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
  private clientErrorCount = 0;
  private readonly startedAt: number;

  constructor(
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {
    this.startedAt = now();
  }

  /** Calls to a provider are counted under `name`, against `limits`, each by its weight (default 1). */
  provider(name: string, limits: ProviderLimits = {}): (ok: boolean, weight?: number) => void {
    let counter = this.providers.get(name);
    if (!counter) {
      counter = new ProviderCounter(name, limits);
      this.providers.set(name, counter);
    }
    const target = counter;
    return (ok, weight) => target.record(ok, this.now(), this.logger, weight);
  }

  /**
   * A check to run before calling the provider `name`: throws BusyError when one of its limits
   * is at BUDGET_SHARE. A provider without limits (or not registered) is never refused.
   */
  budget(name: string): () => void {
    return () => this.providers.get(name)?.checkBudget(this.now(), this.logger);
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

  clientError(): void {
    this.clientErrorCount += 1;
  }

  snapshot(): MetricsSnapshot {
    const now = this.now();
    const caches: MetricsSnapshot['caches'] = {};
    for (const [name, stats] of this.caches) {
      const s = stats();
      // Stale answers and joined loads count as served from cache: they did not wait for the provider.
      const asked = s.hits + s.misses + s.coalesced + s.stale;
      caches[name] = {
        ...s,
        hitRate: asked ? Math.round(((s.hits + s.coalesced + s.stale) / asked) * 1000) / 1000 : null,
      };
    }
    const providers: MetricsSnapshot['providers'] = {};
    for (const [name, counter] of this.providers) providers[name] = counter.usage(now);
    return {
      uptimeSeconds: Math.round((now - this.startedAt) / 1000),
      requests: { ...this.requests },
      rateLimited: this.rateLimitedCount,
      clientErrors: this.clientErrorCount,
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
  record: (ok: boolean, weight?: number) => void,
  logger: Logger,
  fetchFn: typeof fetch = fetch,
  /** How many calls the provider counts a request as (openMeteoWeight); 1 without it. */
  weigh: (url: URL) => number = () => 1,
): typeof fetch {
  return async (input, init) => {
    const started = performance.now();
    const url = new URL(input instanceof Request ? input.url : String(input));
    const where = { provider: name, host: url.host, path: url.pathname };
    // Counted when sent, not when answered: the budget is checked before each call, and calls
    // still under way must count, or a burst near the limit would all pass the check together.
    // A failure adds an error only. (Found by roborev.)
    record(true, weigh(url));
    try {
      const response = await fetchFn(input, init);
      if (!response.ok) record(false, 0);
      logger.debug({ ...where, status: response.status, ms: Math.round(performance.now() - started) }, 'provider call');
      return response;
    } catch (err) {
      record(false, 0);
      logger.warn(
        { ...where, ms: Math.round(performance.now() - started), err: (err as Error).name },
        'provider call failed',
      );
      throw err;
    }
  };
}
