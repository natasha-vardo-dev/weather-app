import { ERROR_CODES, ZodError, type ApiErrorBody, type ErrorCode } from '@weather/shared';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { AppError, ProviderError } from './errors.js';
import { weatherRouter } from './routes/weather.js';
import type { WeatherService } from './services/weatherService.js';

function errorBody(code: ErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}

export function createApp(service: WeatherService, corsOrigins: string[] = []) {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigins.length ? corsOrigins : false }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', weatherRouter(service));

  app.use('/api', (_req, res) => {
    res.status(404).json(errorBody(ERROR_CODES.NOT_FOUND, 'Endpoint not found.'));
  });

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    // Errors are never cached, whatever a route set before failing: a browser would
    // otherwise keep showing a short provider outage for the whole max-age.
    res.set('Cache-Control', 'no-store');
    // Without this a provider outage, a timeout and a rate limit all look the same: a 502.
    if (err instanceof ProviderError) {
      console.warn(`${req.method} ${req.originalUrl} -> provider error: ${err.detail ?? 'unknown'}`);
    }
    if (err instanceof ZodError) {
      res
        .status(400)
        .json(errorBody(ERROR_CODES.INVALID_REQUEST, err.issues[0]?.message ?? 'Invalid request.'));
      return;
    }
    if (err instanceof AppError) {
      res.status(err.status).json(errorBody(err.code, err.message));
      return;
    }
    console.error(err);
    res.status(500).json(errorBody(ERROR_CODES.INTERNAL, 'Something went wrong on our side.'));
  };
  app.use(errorHandler);

  return app;
}
