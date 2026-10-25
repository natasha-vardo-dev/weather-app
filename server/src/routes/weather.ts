import {
  airQualityQuerySchema,
  forecastQuerySchema,
  locationByIdSchema,
  locationsQuerySchema,
  type LocationsResponse,
} from '@weather/shared';
import { Router } from 'express';
import { NotFoundError } from '../errors.js';
import type { WeatherService } from '../services/weatherService.js';

export function weatherRouter(service: WeatherService): Router {
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
      const forecast = await service.getForecast(lat, lon, days);
      // Set only on success: an error must not be cached by browsers or CDNs.
      res.set('Cache-Control', 'public, max-age=300');
      res.json(forecast);
    } catch (err) {
      next(err);
    }
  });

  // Separate from /forecast: different source and cache lifetime, and the forecast
  // must still show when air quality is unavailable.
  router.get('/air-quality', async (req, res, next) => {
    try {
      const { lat, lon } = airQualityQuerySchema.parse(req.query);
      const airQuality = await service.getAirQuality(lat, lon);
      res.set('Cache-Control', 'public, max-age=900');
      res.json(airQuality);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
