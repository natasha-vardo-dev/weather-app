import { ProviderError } from '../errors.js';
import type { Logger } from '../observability/logger.js';

/**
 * Logs a provider failure hidden behind a stale answer, with the same detail the error handler
 * would log for one that reached a user ("timeout", "HTTP 429: …"). No key: it holds
 * coordinates and search words, which the logs leave out.
 */
export function staleErrorLogger(logger: Logger | undefined, cache: string) {
  if (!logger) return undefined;
  return (err: unknown) => {
    if (err instanceof ProviderError)
      logger.warn({ cache, detail: err.detail ?? 'unknown' }, 'provider error, stale value kept');
    else logger.error({ cache, err }, 'load failed, stale value kept');
  };
}
