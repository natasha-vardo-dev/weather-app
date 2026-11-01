import { ERROR_CODES, type ApiErrorBody } from '@weather/shared';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
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
   * cause ten times as many provider calls. (Found by roborev.)
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
