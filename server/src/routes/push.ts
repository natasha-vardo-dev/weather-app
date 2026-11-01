import { alertTopicsSchema, ERROR_CODES, type AlertTopicsResponse } from '@weather/shared';
import express, { Router } from 'express';
import { createHash } from 'node:crypto';
import { AppError } from '../errors.js';
import { concurrencyLimit } from '../providers/http.js';
import type { AlertBroadcastSource, PushSender } from '../providers/types.js';
import { sameSecret } from '../secrets.js';
import { alertTopic, type AlertNotifier } from '../services/alertNotifier.js';
import { TtlCache } from '../services/cache.js';

/**
 * Limits on topic changes, on top of the per-IP limit (rateLimits.ts). Each change is one
 * Firebase Admin call per area, so a script could spend the project's quota; a token is a
 * capability (whoever has it can change its subscriptions), so it gets its own allowance,
 * whatever address it comes from.
 */
export interface PushGuard {
  /**
   * Changes per token per hour: a renewed token re-subscribes every place at once, a person
   * changes a few more; a script with one token sends far more.
   */
  perTokenPerHour: number;
  /** Firebase calls under way at once, across all requests. */
  concurrency: number;
  /** Before each change: throws BusyError when the global budget is spent (Metrics.budget). */
  budget?: () => void;
  /** Counts the Firebase calls a change made against the budget (Metrics.provider). */
  record?: (ok: boolean, calls: number) => void;
}

export const DEFAULT_PUSH_GUARD: PushGuard = { perTokenPerHour: 120, concurrency: 4 };

const HOUR = 60 * 60 * 1000;

/** A device turns warnings for a place on or off. Nothing is stored here: FCM keeps the topics. */
export function pushRouter(source: AlertBroadcastSource, sender: PushSender, guard = DEFAULT_PUSH_GUARD): Router {
  const router = Router();
  // Keyed by a hash: tokens are credentials and never kept as they came.
  const perToken = new TtlCache<{ count: number; since: number }>(HOUR, { maxEntries: 10_000 });
  const limit = concurrencyLimit(guard.concurrency);
  /** The same change already under way (a double click, a retry): joined, not repeated. */
  const inFlight = new Map<string, Promise<void>>();

  router.post('/push/topics', express.json({ limit: '8kb' }), async (req, res, next) => {
    try {
      const { token, latitude, longitude, group, level, subscribe } = alertTopicsSchema.parse(req.body);
      const tokenKey = createHash('sha256').update(token).digest('base64url');
      const areas = await source.areasAt(latitude, longitude);
      const topics = areas.map((area) => alertTopic(area, group, level));
      const change = `${tokenKey} ${subscribe ? '+' : '-'} ${topics.join(',')}`;
      let pending = inFlight.get(change);
      if (!pending) {
        // Turning notifications off always goes through (still counted, still under the per-IP
        // limit): a spent budget or a busy token must never keep pushes coming to someone who
        // asked them to stop.
        if (subscribe) {
          const now = Date.now();
          const used = perToken.get(tokenKey);
          const window = used && now - used.since < HOUR ? used : { count: 0, since: now };
          if (window.count >= guard.perTokenPerHour) {
            res.set('Retry-After', String(Math.ceil((window.since + HOUR - now) / 1000)));
            throw new AppError('Too many changes for this device. Try again later.', 429, ERROR_CODES.RATE_LIMITED);
          }
          guard.budget?.();
          perToken.set(tokenKey, { count: window.count + 1, since: window.since });
        }
        // A change that never took effect (refused by the budget in the queue, or failed at
        // Firebase) gives its slot back: a client retrying must not run out of allowance for nothing.
        const refund = () => {
          const used = perToken.get(tokenKey);
          if (subscribe && used && used.count > 0) perToken.set(tokenKey, { ...used, count: used.count - 1 });
        };
        pending = limit(async () => {
          // Checked again when its turn comes: changes queued during a burst passed the first
          // check before the calls ahead of them were counted.
          if (subscribe) guard.budget?.();
          // Counted when sent, like instrumentFetch: the next check then sees calls under way.
          guard.record?.(true, topics.length);
          try {
            if (subscribe) await sender.subscribe(token, topics);
            else await sender.unsubscribe(token, topics);
          } catch (err) {
            guard.record?.(false, 0);
            throw err;
          }
        })
          .catch((err: unknown) => {
            refund();
            throw err;
          })
          .finally(() => inFlight.delete(change));
        inFlight.set(change, pending);
      }
      await pending;
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
