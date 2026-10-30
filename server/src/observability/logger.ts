import type { RequestHandler } from 'express';
import { pino, type Logger } from 'pino';

export type { Logger };

/**
 * JSON lines on stdout: Render (and any log service) keeps and searches them by field.
 * `npm run dev` pipes them through pino-pretty. LOG_LEVEL: debug shows each provider call.
 */
export function createLogger(level = process.env.LOG_LEVEL?.trim() || 'info'): Logger {
  return pino({ level, base: { service: 'weather-api' } });
}

/** For tests and callers that do not care. */
export const silentLogger: Logger = pino({ level: 'silent' });

/** Requests not worth a line each: the health check runs every few seconds. */
const QUIET_PATHS = new Set(['/api/health']);

/**
 * One line per request when it finishes: method, path, status, duration. The path is logged
 * without its query, which carries coordinates (the user's position, for /places/reverse)
 * and search terms; IPs are not logged either.
 */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const path = req.originalUrl.split('?')[0]!;
      if (QUIET_PATHS.has(path)) return;
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const fields = { method: req.method, path, status: res.statusCode, ms: Math.round(ms) };
      if (res.statusCode >= 500) logger.error(fields, 'request failed');
      else if (res.statusCode === 429) logger.warn(fields, 'request rate limited');
      else logger.info(fields, 'request');
    });
    next();
  };
}
