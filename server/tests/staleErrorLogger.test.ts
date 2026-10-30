import { describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../src/errors.js';
import type { Logger } from '../src/observability/logger.js';
import { staleErrorLogger } from '../src/services/staleErrorLogger.js';

function fakeLogger() {
  return { warn: vi.fn(), error: vi.fn() };
}

describe('staleErrorLogger', () => {
  it('logs a provider error as a warning with its detail and the cache, without the key', () => {
    const logger = fakeLogger();
    staleErrorLogger(logger as unknown as Logger, 'forecast')!(new ProviderError('HTTP 429: limit'));
    expect(logger.warn).toHaveBeenCalledWith(
      { cache: 'forecast', detail: 'HTTP 429: limit' },
      'provider error, stale value kept',
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs any other error as an error, with the error for its stack', () => {
    const logger = fakeLogger();
    const err = new TypeError('bug');
    staleErrorLogger(logger as unknown as Logger, 'search')!(err);
    expect(logger.error).toHaveBeenCalledWith({ cache: 'search', err }, 'load failed, stale value kept');
  });

  it('is nothing without a logger', () => {
    expect(staleErrorLogger(undefined, 'forecast')).toBeUndefined();
  });
});
