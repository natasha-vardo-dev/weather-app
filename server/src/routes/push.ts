import { alertTopicsSchema, type AlertTopicsResponse } from '@weather/shared';
import express, { Router } from 'express';
import type { AlertBroadcastSource, PushSender } from '../providers/types.js';
import { sameSecret } from '../secrets.js';
import { alertTopic, type AlertNotifier } from '../services/alertNotifier.js';

/** A device turns warnings for a place on or off. Nothing is stored here: FCM keeps the topics. */
export function pushRouter(source: AlertBroadcastSource, sender: PushSender): Router {
  const router = Router();
  router.post('/push/topics', express.json({ limit: '8kb' }), async (req, res, next) => {
    try {
      const { token, latitude, longitude, group, level, subscribe } = alertTopicsSchema.parse(req.body);
      const areas = await source.areasAt(latitude, longitude);
      const topics = areas.map((area) => alertTopic(area, group, level));
      if (subscribe) await sender.subscribe(token, topics);
      else await sender.unsubscribe(token, topics);
      res.set('Cache-Control', 'no-store');
      res.json({ areas } satisfies AlertTopicsResponse);
    } catch (err) {
      next(err);
    }
  });
  return router;
}

/**
 * The scheduler's call (every ~5 minutes, e.g. cron-job.org): check for new warnings and push
 * them. Behind a secret, since each run reads ~40 feeds and may send thousands of messages.
 */
export function notifyRouter(notifier: AlertNotifier, secret: string): Router {
  const router = Router();
  router.post('/internal/alerts/notify', async (req, res, next) => {
    const given = req.get('authorization')?.replace(/^Bearer /, '') ?? '';
    if (!sameSecret(given, secret)) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
      return;
    }
    try {
      res.set('Cache-Control', 'no-store');
      res.json(await notifier.run());
    } catch (err) {
      next(err);
    }
  });
  return router;
}
