import {
  airQualityQuerySchema,
  forecastQuerySchema,
  forecastsQuerySchema,
  type ForecastsResponse,
  locationByIdSchema,
  locationsQuerySchema,
  type LocationsResponse,
} from '@weather/shared';
import { Router } from 'express';
import { AppError, errorDetails, NotFoundError, type ProviderError } from '../errors.js';
import type { Logger } from '../observability/logger.js';
import type { WeatherService } from '../services/weatherService.js';

const FORECAST_MAX_AGE = 300;
const AIR_QUALITY_MAX_AGE = 900;
/**
 * A stale answer (past the server's TTL: a refresh is under way, or the provider is down) is
 * kept by browsers for a minute only, so the next look gets the new data instead of the old
 * one for another five or fifteen minutes. Not `no-store`: the service worker still keeps it,
 * as the best copy there is for offline.
 */
const STALE_MAX_AGE = 60;
const maxAge = (seconds: number, stale: boolean) => `public, max-age=${stale ? STALE_MAX_AGE : seconds}`;

export function weatherRouter(service: WeatherService, logger?: Logger): Router {
  const router = Router();

  router.get('/locations', async (req, res, next) => {
    try {
      const { q, limit, lang } = locationsQuerySchema.parse(req.query);
      const body: LocationsResponse = { locations: await service.searchLocations(q, limit, lang) };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  // A saved place's name in the current language (no reverse geocoding by coordinates).
  router.get('/locations/:id', async (req, res, next) => {
    try {
      const { id, lang } = locationByIdSchema.parse({ id: req.params.id, lang: req.query.lang });
      const location = await service.getLocation(id, lang);
      if (!location) throw new NotFoundError('Location not found.');
      res.set('Cache-Control', 'public, max-age=86400');
      res.json(location);
    } catch (err) {
      next(err);
    }
  });

  router.get('/forecast', async (req, res, next) => {
    try {
      const { lat, lon, days } = forecastQuerySchema.parse(req.query);
      const { value: forecast, stale } = await service.getForecast(lat, lon, days);
      // Set only on success: an error must not be cached by browsers or CDNs.
      res.set('Cache-Control', maxAge(FORECAST_MAX_AGE, stale));
      res.json(forecast);
    } catch (err) {
      next(err);
    }
  });

  // Saved cities in one request: the start page with ten of them made ten. Each place goes
  // through the same cache as /forecast, and one failing does not fail the others.
  router.get('/forecasts', async (req, res, next) => {
    try {
      const { places, days } = forecastsQuerySchema.parse(req.query);
      const settled = await Promise.allSettled(places.map(({ lat, lon }) => service.getForecast(lat, lon, days)));
      const failed = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      // Nothing to show: the usual error response (502 for the provider), so no one stores it.
      if (failed.length === settled.length) throw failed[0]!.reason;
      for (const { reason } of failed) {
        // A bug (not an AppError) keeps its stack in the log, as it would on /forecast.
        if (reason instanceof AppError) {
          logger?.warn({ code: reason.code, detail: (reason as ProviderError).detail }, 'forecast in batch failed');
        } else logger?.error({ err: reason }, 'forecast in batch failed');
      }
      const body: ForecastsResponse = {
        forecasts: settled.map((r) =>
          r.status === 'fulfilled' ? { forecast: r.value.value } : { error: errorDetails(r.reason) },
        ),
      };
      // A partial answer is not cached: the failed places would stay missing for max-age.
      const stale = settled.some((r) => r.status === 'fulfilled' && r.value.stale);
      res.set('Cache-Control', failed.length ? 'no-store' : maxAge(FORECAST_MAX_AGE, stale));
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  // Separate from /forecast: different source and cache lifetime, and the forecast
  // must still show when air quality is unavailable.
  router.get('/air-quality', async (req, res, next) => {
    try {
      const { lat, lon } = airQualityQuerySchema.parse(req.query);
      const { value: airQuality, stale } = await service.getAirQuality(lat, lon);
      res.set('Cache-Control', maxAge(AIR_QUALITY_MAX_AGE, stale));
      res.json(airQuality);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
