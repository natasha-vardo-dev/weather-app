import { API_PREFIX, ERROR_CODES, ZodError, type ApiErrorBody, type ErrorCode } from '@weather/shared';
import cors from 'cors';
import { isIP } from 'node:net';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { AppError, ProviderError } from './errors.js';
import { requestLogger, silentLogger, type Logger } from './observability/logger.js';
import { FCM_TOPIC_LIMITS, type Metrics } from './observability/metrics.js';
import { DEFAULT_RATE_LIMITS, rateLimiters, type RateLimits } from './rateLimits.js';
import { sameSecret } from './secrets.js';
import { alertsRouter } from './routes/alerts.js';
import { placesRouter } from './routes/places.js';
import { DEFAULT_PUSH_GUARD, notifyRouter, pushRouter, type PushGuard } from './routes/push.js';
import type { AlertBroadcastSource, PushSender } from './providers/types.js';
import type { AlertNotifier } from './services/alertNotifier.js';
import { clientErrorsRouter } from './routes/clientErrors.js';
import { weatherRouter } from './routes/weather.js';
import type { AlertService } from './services/alertService.js';
import type { ApproximateLocationService } from './services/approximateService.js';
import type { PlaceService } from './services/placeService.js';
import type { WeatherService } from './services/weatherService.js';

/**
 * How long without a fully successful notifier run before /api/health/notify alerts: six
 * missed 5-minute runs, so one failed feed or a slow run does not page anyone.
 */
export const NOTIFY_STALE_MS = 30 * 60 * 1000;

/** The API versions served (when a new one comes, the old prefix stays here until it is removed). */
const SERVED_VERSIONS = new Set([API_PREFIX.slice('/api/'.length)]);

/**
 * Which API version a path asks for: a served one ("v1"), "none" for an /api path without
 * one, "other" for any other version; operations paths have none. A fixed set of names, so
 * requests for made-up versions (/api/v987654321/…) cannot grow the metrics without limit.
 */
function apiVersion(path: string): string | undefined {
  if (
    !path.startsWith('/api/') ||
    path === '/api/health' ||
    path.startsWith('/api/health/') ||
    path.startsWith('/api/internal/')
  )
    return undefined;
  const version = /^\/api\/(v\d+)\//.exec(path)?.[1];
  if (!version) return 'none';
  return SERVED_VERSIONS.has(version) ? version : 'other';
}

function errorBody(code: ErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}

/** Push notifications about warnings: on only when Firebase (and, for sending, a secret) is configured. */
export interface PushSetup {
  source: AlertBroadcastSource;
  sender: PushSender;
  notifier?: AlertNotifier;
  notifySecret?: string;
  /** Per-token allowance and concurrency of topic changes; the global budget comes from `metrics`. */
  guard?: Pick<PushGuard, 'perTokenPerHour' | 'concurrency'>;
}

export interface AppOptions {
  corsOrigins?: string[];
  /** Without them /api/places/* is not served (tests of other routes). */
  places?: PlaceService;
  approximate?: ApproximateLocationService;
  /** Without it /api/alerts is not served. */
  alerts?: AlertService;
  push?: PushSetup;
  /**
   * How many proxies in front may set X-Forwarded-For, so `req.ip` is the user's address
   * (Express "trust proxy"). Rate limits and the approximate location depend on it.
   */
  trustProxy?: number | boolean;
  /** Requests per minute per IP; false turns limiting off. */
  rateLimits?: RateLimits | false;
  logger?: Logger;
  metrics?: Metrics;
  /** Guards GET /api/internal/metrics (bearer token); without it the endpoint does not exist. */
  metricsSecret?: string;
  /**
   * Shared with the frontend's proxy (Vercel middleware), which sends it in the
   * X-Proxy-Secret header: requests without it are refused, so the API answers only what
   * came through the proxy. Otherwise anyone could call the API host directly with a forged
   * X-Forwarded-For, which the trusted proxies pass on, and get a new "IP" (and a fresh
   * per-IP allowance) with every request. Without it (local development, tests) every
   * request is served. Health and /internal/* stay open: Render and the scheduler call them
   * directly, and /internal/* has its own secret.
   */
  proxySecret?: string;
  /** Shown by /api/health, to tell which build is running (Render sets RENDER_GIT_COMMIT). */
  version?: string;
  /**
   * True once the server is shutting down (shutdown.ts): health answers 503, so the host stops
   * routing here, and every answer closes its connection instead of keeping it alive.
   */
  draining?: () => boolean;
}

export function createApp(service: WeatherService, options: AppOptions = {}) {
  const {
    corsOrigins = [],
    places,
    approximate,
    alerts,
    push,
    trustProxy = false,
    rateLimits = DEFAULT_RATE_LIMITS,
    logger = silentLogger,
    metrics,
    metricsSecret,
    proxySecret,
    version,
    draining = () => false,
  } = options;
  const app = express();
  const startedAt = Date.now();

  app.disable('x-powered-by');
  // Security headers for the API's own answers (nosniff, no framing, HSTS, a CSP that allows
  // nothing: they are JSON, never pages). The site's headers are in client/vercel.json.
  app.use(helmet());
  app.set('trust proxy', trustProxy);
  app.use(requestLogger(logger));
  app.use((_req, res, next) => {
    if (draining()) res.set('Connection', 'close');
    next();
  });
  if (metrics) {
    app.use((req, res, next) => {
      // Read now: mounted routers rewrite req.url (and so req.path) before the answer is sent.
      const version = apiVersion(req.path);
      // Requests refused for coming past the proxy are not clients of a version: anyone can send them.
      res.on('finish', () => metrics.request(res.statusCode, res.locals.unproxied ? undefined : version));
      next();
    });
  }
  app.use(cors({ origin: corsOrigins.length ? corsOrigins : false }));

  // Render's health check (every few seconds): is the process up and answering. Deliberately
  // does not call the weather provider: its outage is not ours, and failing here would make
  // Render restart or stop routing to an instance that still serves cached forecasts.
  // Before the rate limits, so checks never use up anyone's allowance.
  // With a proxy secret, health also says whether this request carried it (`proxied`): health
  // itself is open, so an uptime monitor calling it through the site would stay green with the
  // secrets different on Vercel and Render, while every other API call got 404 (found by
  // roborev). The monitor checks for `"proxied":true` (docs/operations.md). Says nothing of the secret.
  app.get('/api/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (draining()) {
      res.status(503).json({ status: 'draining', version });
      return;
    }
    const proxied = proxySecret ? { proxied: sameSecret(req.get('x-proxy-secret') ?? '', proxySecret) } : {};
    res.json({ status: 'ok', uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), version, ...proxied });
  });

  // For an uptime monitor (docs/operations.md): 503 while any provider limit is used to 80% or
  // more, so the monitor's alert reaches someone; the same moment only logs a warning otherwise.
  // Public and without a secret, like health (free monitors cannot send headers): it tells how
  // busy the providers are, nothing about users. Not the health check: nearing a limit is no
  // reason for Render to restart an instance that serves cached forecasts.
  if (metrics) {
    app.get('/api/health/quota', (_req, res) => {
      res.set('Cache-Control', 'no-store');
      const near = metrics.nearLimits();
      if (near.length) res.status(503).json({ status: 'near-limit', near });
      else res.json({ status: 'ok' });
    });
  }

  // For an uptime monitor (docs/operations.md): 503 when no notifier run has fully succeeded
  // (every feed read, nothing refused) for NOTIFY_STALE_MS, or FCM refused messages for good
  // within it, so a broken scheduler, a feed down for long or a payload FCM rejects reaches
  // someone instead of looking like "no warnings".
  // Public like quota: feed codes and times, nothing about users.
  if (push?.notifier) {
    const notifier = push.notifier;
    app.get('/api/health/notify', (_req, res) => {
      res.set('Cache-Control', 'no-store');
      const status = notifier.status();
      const since = Math.max(status.lastSuccessAt ?? 0, startedAt);
      // A refusal is recorded as sent (retrying fails the same way), so later clean runs would
      // hide it: it keeps the monitor red for the same window instead.
      const refusedRecently = status.lastRejectedAt !== null && Date.now() - status.lastRejectedAt <= NOTIFY_STALE_MS;
      const stale = Date.now() - since > NOTIFY_STALE_MS || refusedRecently;
      const body = {
        status: stale ? 'stale' : 'ok',
        store: status.store,
        lastRunAt: status.lastRunAt && new Date(status.lastRunAt).toISOString(),
        lastSuccessAt: status.lastSuccessAt && new Date(status.lastSuccessAt).toISOString(),
        feedsFailed: status.feedsFailed,
        rejected: status.rejected,
        lastRejectedAt: status.lastRejectedAt && new Date(status.lastRejectedAt).toISOString(),
      };
      res.status(stale ? 503 : 200).json(body);
    });
  }

  // Operators only: cache hit rates and provider calls against their limits.
  if (metrics && metricsSecret) {
    app.get('/api/internal/metrics', (req, res) => {
      const given = req.get('authorization')?.replace(/^Bearer /, '') ?? '';
      if (!sameSecret(given, metricsSecret)) {
        res.status(404).json(errorBody(ERROR_CODES.NOT_FOUND, 'Endpoint not found.'));
        return;
      }
      res.set('Cache-Control', 'no-store');
      res.json(metrics.snapshot());
    });
  }

  if (proxySecret) {
    let lastLogged = -Infinity;
    app.use('/api', (req, res, next) => {
      if (req.path.startsWith('/internal/')) {
        next();
        return;
      }
      if (sameSecret(req.get('x-proxy-secret') ?? '', proxySecret)) {
        // The proxy's word for the user's address (it saw the connection), trusted only with
        // the secret: rate limits and the approximate location key on req.ip, and counting
        // proxies in X-Forwarded-For depends on how the host forwards it.
        const clientIp = req.get('x-client-ip')?.trim();
        if (clientIp && isIP(clientIp)) Object.defineProperty(req, 'ip', { value: clientIp, configurable: true });
        next();
        return;
      }
      // Logged at most once a minute: a misconfigured proxy (secret missing or different)
      // would otherwise log every request, and it is the first thing to look at then.
      if (Date.now() - lastLogged >= 60_000) {
        lastLogged = Date.now();
        logger.warn({ path: req.path }, 'request without the proxy secret refused');
      }
      res.set('Cache-Control', 'no-store');
      res.locals.unproxied = true;
      // As an unknown endpoint, like the internal ones without their secret.
      res.status(404).json(errorBody(ERROR_CODES.NOT_FOUND, 'Endpoint not found.'));
    });
  }

  if (rateLimits) {
    const limit = rateLimiters(rateLimits, logger, metrics);
    // The scheduler's notify call is behind a secret and must never be refused.
    app.use('/api', (req, res, next) => (req.path.startsWith('/internal/') ? next() : limit.api(req, res, next)));
    // Search only, not /locations/:id (cached a day, one per saved city).
    app.get(`${API_PREFIX}/locations`, limit.search);
    app.get(`${API_PREFIX}/forecasts`, limit.forecasts);
    app.use(`${API_PREFIX}/places`, limit.places);
    app.use(`${API_PREFIX}/client-errors`, limit.clientErrors);
    app.use(`${API_PREFIX}/push`, limit.push);
  }

  // The contract, under its version (API_PREFIX). A breaking change gets a new prefix served
  // next to this one until old clients are gone (counted per version in the metrics).
  app.use(API_PREFIX, weatherRouter(service, logger));
  app.use(API_PREFIX, clientErrorsRouter(logger, metrics));
  if (places) app.use(API_PREFIX, placesRouter(places, approximate));
  if (alerts) app.use(API_PREFIX, alertsRouter(alerts));
  if (push) {
    const guard: PushGuard = {
      ...DEFAULT_PUSH_GUARD,
      ...push.guard,
      budget: metrics?.budget('fcm-topics'),
      record: metrics?.provider('fcm-topics', FCM_TOPIC_LIMITS),
    };
    app.use(API_PREFIX, pushRouter(push.source, push.sender, guard));
  }
  // Operations, not the contract: no version, like /api/health.
  if (push?.notifier && push.notifySecret) app.use('/api', notifyRouter(push.notifier, push.notifySecret));

  app.use('/api', (_req, res) => {
    res.status(404).json(errorBody(ERROR_CODES.NOT_FOUND, 'Endpoint not found.'));
  });

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    // Errors are never cached, whatever a route set before failing: a browser would
    // otherwise keep showing a short provider outage for the whole max-age.
    res.set('Cache-Control', 'no-store');
    const path = req.originalUrl.split('?')[0];
    // Without this a provider outage, a timeout and a rate limit all look the same: a 502.
    if (err instanceof ProviderError) {
      logger.warn({ method: req.method, path, detail: err.detail ?? 'unknown' }, 'provider error');
    }
    if (err instanceof ZodError) {
      res.status(400).json(errorBody(ERROR_CODES.INVALID_REQUEST, err.issues[0]?.message ?? 'Invalid request.'));
      return;
    }
    if (err instanceof AppError) {
      res.status(err.status).json(errorBody(err.code, err.message));
      return;
    }
    // The JSON body parser's own errors (broken JSON, too large) are the client's: 400 or 413,
    // not a 500 logged as our bug. Found while moving to Express 5 (and its body-parser 2).
    const status = (err as { status?: unknown; type?: unknown }).status;
    if (
      typeof (err as { type?: unknown }).type === 'string' &&
      typeof status === 'number' &&
      status >= 400 &&
      status < 500
    ) {
      res.status(status).json(errorBody(ERROR_CODES.INVALID_REQUEST, 'Invalid request body.'));
      return;
    }
    logger.error({ method: req.method, path, err }, 'unhandled error');
    res.status(500).json(errorBody(ERROR_CODES.INTERNAL, 'Something went wrong on our side.'));
  };
  app.use(errorHandler);

  return app;
}
