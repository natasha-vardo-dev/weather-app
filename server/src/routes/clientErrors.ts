import { clientErrorSchema } from '@weather/shared';
import express, { Router } from 'express';
import type { Logger } from '../observability/logger.js';
import type { Metrics } from '../observability/metrics.js';

/**
 * Errors from users' browsers (ErrorBoundary, uncaught errors and rejections), written to the
 * server log as a warning: without it nobody would know a page broke for someone. Our own
 * endpoint rather than an error-tracking service (decision of the project's owner): nothing
 * leaves our hosts, at the price of no grouping or alerting (search the logs for
 * "client error"). The user agent tells the browser; no IP is logged, as elsewhere.
 */
export function clientErrorsRouter(logger: Logger, metrics?: Metrics): Router {
  const router = Router();
  router.post('/client-errors', express.json({ limit: '16kb' }), (req, res, next) => {
    try {
      const report = clientErrorSchema.parse(req.body);
      metrics?.clientError();
      logger.warn({ ...report, userAgent: req.get('user-agent')?.slice(0, 200) }, 'client error');
      res.set('Cache-Control', 'no-store');
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });
  return router;
}
