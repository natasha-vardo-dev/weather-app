import { forecastQuerySchema, locationsQuerySchema, type LocationsResponse } from '@weather/shared';
import { Router } from 'express';
import type { WeatherService } from '../services/weatherService.js';

export function weatherRouter(service: WeatherService): Router {
  const router = Router();

  router.get('/locations', async (req, res, next) => {
    try {
      const { q, limit } = locationsQuerySchema.parse(req.query);
      const body: LocationsResponse = { locations: await service.searchLocations(q, limit) };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.get('/forecast', async (req, res, next) => {
    try {
      const { lat, lon, days } = forecastQuerySchema.parse(req.query);
      res.set('Cache-Control', 'public, max-age=300');
      res.json(await service.getForecast(lat, lon, days));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
