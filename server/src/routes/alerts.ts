import { ALERTS_MAX_AGE_SECONDS, alertsQuerySchema } from '@weather/shared';
import { Router } from 'express';
import type { AlertService } from '../services/alertService.js';

export function alertsRouter(alerts: AlertService): Router {
  const router = Router();

  // Official warnings at a place. Kept apart from /forecast, so a warnings outage never
  // breaks or delays the forecast (like air quality).
  router.get('/alerts', async (req, res, next) => {
    try {
      const { lat, lon, lang } = alertsQuerySchema.parse(req.query);
      const result = await alerts.getAlerts(lat, lon, lang);
      // Short: warnings must reach users within minutes (see ALERTS_FEED_TTL_SECONDS).
      res.set('Cache-Control', `public, max-age=${ALERTS_MAX_AGE_SECONDS}`);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
