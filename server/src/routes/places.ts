import { reverseQuerySchema } from '@weather/shared';
import { Router } from 'express';
import { NotFoundError } from '../errors.js';
import type { PlaceService } from '../services/placeService.js';

export function placesRouter(places: PlaceService): Router {
  const router = Router();

  // The place at the user's location: Open-Meteo has no reverse geocoding.
  router.get('/places/reverse', async (req, res, next) => {
    try {
      const { lat, lon, lang } = reverseQuerySchema.parse(req.query);
      const { place, cacheable } = await places.reverse(lat, lon, lang);
      if (!place) throw new NotFoundError('No place at these coordinates.');
      // A fallback forced by a failed city search must not stick in browsers either.
      res.set('Cache-Control', cacheable ? 'public, max-age=86400' : 'no-store');
      res.json(place);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
