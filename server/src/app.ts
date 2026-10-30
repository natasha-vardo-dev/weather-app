import { ERROR_CODES, ZodError, type ApiErrorBody, type ErrorCode } from '@weather/shared';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { AppError, ProviderError } from './errors.js';
import { requestLogger, silentLogger, type Logger } from './observability/logger.js';
import type { Metrics } from './observability/metrics.js';
import { DEFAULT_RATE_LIMITS, rateLimiters, type RateLimits } from './rateLimits.js';
import { sameSecret } from './secrets.js';
import { alertsRouter } from './routes/alerts.js';
import { placesRouter } from './routes/places.js';
import { notifyRouter, pushRouter } from './routes/push.js';
import type { AlertBroadcastSource, PushSender } from './providers/types.js';
import type { AlertNotifier } from './services/alertNotifier.js';
import { weatherRouter } from './routes/weather.js';
import type { AlertService } from './services/alertService.js';
import type { ApproximateLocationService } from './services/approximateService.js';
import type { PlaceService } from './services/placeService.js';
import type { WeatherService } from './services/weatherService.js';

function errorBody(code: ErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}

/** Push notifications about warnings: on only when Firebase (and, for sending, a secret) is configured. */
export interface PushSetup {
  source: AlertBroadcastSource;
  sender: PushSender;
  notifier?: AlertNotifier;
  notifySecret?: string;
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
  /** Shown by /api/health, to tell which build is running (Render sets RENDER_GIT_COMMIT). */
  version?: string;
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
    version,
  } = options;
  const app = express();
  const startedAt = Date.now();

  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(requestLogger(logger));
  if (metrics) {
    app.use((_req, res, next) => {
      res.on('finish', () => metrics.request(res.statusCode));
      next();
    });
  }
  app.use(cors({ origin: corsOrigins.length ? corsOrigins : false }));

  // Render's health check (every few seconds): is the process up and answering. Deliberately
  // does not call the weather provider: its outage is not ours, and failing here would make
  // Render restart or stop routing to an instance that still serves cached forecasts.
  // Before the rate limits, so checks never use up anyone's allowance.
  app.get('/api/health', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'ok', uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), version });
  });

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

  if (rateLimits) {
    const limit = rateLimiters(rateLimits, logger, metrics);
    // The scheduler's notify call is behind a secret and must never be refused.
    app.use('/api', (req, res, next) => (req.path.startsWith('/internal/') ? next() : limit.api(req, res, next)));
    // Search only, not /locations/:id (cached a day, one per saved city).
    app.get('/api/locations', limit.search);
    app.get('/api/forecasts', limit.forecasts);
    app.use('/api/places', limit.places);
  }

  app.use('/api', weatherRouter(service, logger));
  if (places) app.use('/api', placesRouter(places, approximate));
  if (alerts) app.use('/api', alertsRouter(alerts));
  if (push) {
    app.use('/api', pushRouter(push.source, push.sender));
    if (push.notifier && push.notifySecret) app.use('/api', notifyRouter(push.notifier, push.notifySecret));
  }

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
    logger.error({ method: req.method, path, err }, 'unhandled error');
    res.status(500).json(errorBody(ERROR_CODES.INTERNAL, 'Something went wrong on our side.'));
  };
  app.use(errorHandler);

  return app;
}
