import { ERROR_CODES, type ApiErrorBody } from '@weather/shared';
import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { RateLimitedError } from './errors.js';
import type { Logger } from './observability/logger.js';
import type { Metrics } from './observability/metrics.js';

/** Requests per minute from one IP address. */
export interface RateLimits {
  /** Everything under /api: generous, so it stops scripts, not people (an office shares one IP). */
  api: number;
  /**
   * Batches of forecasts (/api/forecasts, up to 10 places each). A batch is one request but up to
   * ten provider calls, so it has its own allowance in batches: 30 is 300 places, as many as
   * single forecasts. Under the general one only, a script sending batches of new places could
   * cause ten times as many provider calls.
   */
  forecasts: number;
  /** City search: most of it misses the cache (a long tail of queries), so each costs provider quota. */
  search: number;
  /** /places/*: Nominatim allows one request per second for the whole server, ipwho.is a low volume. */
  places: number;
  /**
   * Error reports from browsers: a page in trouble may fail again and again, and each report
   * is a log line. Ten a minute tells what broke; more only floods the logs.
   */
  clientErrors: number;
  /**
   * Notification changes (/push/*): each is a Firebase call per area. A new token re-subscribes
   * every place with notifications on (the client sends them one by one), so the limit is sized
   * for that, not for a person's few clicks; the per-token allowance and the global budget that
   * protect Firebase's quota are in routes/push.ts.
   */
  push: number;
}

export const DEFAULT_RATE_LIMITS: RateLimits = {
  api: 300,
  forecasts: 30,
  search: 60,
  places: 10,
  clientErrors: 10,
  push: 60,
};

/**
 * Per-IP limits, in memory (one instance; with several, a Redis store shares the counts).
 * The IP is `req.ip`, so it is only right with Express "trust proxy" set to the number of
 * proxies in front (TRUST_PROXY): trusting X-Forwarded-For from anyone would let a client
 * pick a new address for every request and never be limited. The library checks this setup
 * and logs a warning when it looks wrong.
 *
 * The answer is the API's usual error body with code RATE_LIMITED, and the standard
 * RateLimit and Retry-After headers.
 */
export function rateLimiters(limits: RateLimits, logger: Logger, metrics?: Metrics) {
  const make = (limit: number, name: string): RequestHandler =>
    rateLimit({
      windowMs: 60_000,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      // Reported as a log line instead of an exception, so a proxy misconfiguration is visible.
      validate: { default: true },
      handler: (req, res) => {
        metrics?.rateLimited();
        logger.warn({ limiter: name, path: req.originalUrl.split('?')[0] }, 'rate limit reached');
        res.set('Cache-Control', 'no-store');
        res.status(429).json({
          error: { code: ERROR_CODES.RATE_LIMITED, message: 'Too many requests. Try again in a minute.' },
        } satisfies ApiErrorBody);
      },
    });
  return {
    api: make(limits.api, 'api'),
    forecasts: make(limits.forecasts, 'forecasts'),
    search: make(limits.search, 'search'),
    places: make(limits.places, 'places'),
    clientErrors: make(limits.clientErrors, 'clientErrors'),
    push: make(limits.push, 'push'),
  };
}

/**
 * Provider calls (cache misses) one address may cause through /forecast, /forecasts and
 * /air-quality, per window. The limits above count requests, not what they cost: a forecast
 * from the cache costs nothing, a new place about 2.2 Open-Meteo calls. Within them one address
 * could ask for ~300 new places a minute (coordinates a hundredth of a degree apart are all new)
 * and spend the server's daily quota, shared by every user, in a quarter of an hour; the global
 * budget (Metrics.budget) would then refuse new forecasts to everyone for the rest of the day.
 *
 * 30 a minute is a cold start page with ten saved cities and room to spare (a city page asks for
 * a forecast and air quality: two); 150 an hour is a long look around the map. One address at
 * the hourly limit all day stays below the daily budget (150 × 24 × 2.2 ≈ 7 900 < 9 000), so it
 * slows the quota down rather than spending it. Many addresses are what the budget is for.
 */
export interface LoadLimits {
  perMinute: number;
  perHour: number;
}

export const DEFAULT_LOAD_LIMITS: LoadLimits = { perMinute: 30, perHour: 150 };

/**
 * Addresses counted per window. Past it new ones are not counted (and not refused): memory stays
 * bounded when very many addresses ask at once, and against those the global budget holds.
 */
export const MAX_TRACKED_ADDRESSES = 50_000;

interface Window {
  ms: number;
  limit: number;
  start: number;
  counts: Map<string, number>;
}

/**
 * Per-address allowances of provider calls, in memory and per instance like the request limits.
 * Windows are fixed (counts reset at once when one ends), as express-rate-limit's are.
 */
export class LoadLimiter {
  private readonly windows: Window[];
  private lastLogged = -Infinity;

  constructor(
    limits: LoadLimits,
    private readonly logger?: Logger,
    private readonly metrics?: Metrics,
    private readonly now: () => number = Date.now,
  ) {
    const start = now();
    this.windows = [
      { ms: 60_000, limit: limits.perMinute, start, counts: new Map() },
      { ms: 3_600_000, limit: limits.perHour, start, counts: new Map() },
    ];
  }

  /**
   * A check for one request from `ip`, to run before each provider call the request causes
   * (WeatherService): counts the call, or throws RateLimitedError when the address has none left.
   * Cached answers never run it. IPv6 addresses count per /56, as the request limits do.
   */
  allowance(ip: string | undefined): () => void {
    const key = ip ? ipKeyGenerator(ip) : 'unknown';
    return () => {
      const now = this.now();
      for (const window of this.windows) {
        if (now - window.start >= window.ms) {
          window.start = now;
          window.counts.clear();
        }
      }
      const spent = this.windows.filter((window) => (window.counts.get(key) ?? 0) >= window.limit);
      if (spent.length > 0) {
        this.metrics?.rateLimited();
        // Once a minute at most: a script past its allowance would otherwise log every request.
        if (now - this.lastLogged >= 60_000) {
          this.lastLogged = now;
          this.logger?.warn({ limiter: 'loads' }, 'rate limit reached');
        }
        // When the last spent window starts over, as the request limits' Retry-After says.
        const retryAfterMs = Math.max(...spent.map((window) => window.start + window.ms - now));
        throw new RateLimitedError(undefined, Math.max(1, Math.ceil(retryAfterMs / 1000)));
      }
      for (const window of this.windows) {
        const count = window.counts.get(key);
        if (count !== undefined) window.counts.set(key, count + 1);
        else if (window.counts.size < MAX_TRACKED_ADDRESSES) window.counts.set(key, 1);
      }
    };
  }
}
