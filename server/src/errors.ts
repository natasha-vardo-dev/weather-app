import { ERROR_CODES, type ErrorCode } from '@weather/shared';

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: ErrorCode,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ProviderError extends AppError {
  /**
   * @param detail What went wrong, for the server log only ("timeout", "HTTP 429: …").
   *   The client gets the generic message: provider details are not its business.
   */
  constructor(
    public readonly detail?: string,
    message = 'The weather service is not responding. Try again in a minute.',
  ) {
    super(message, 502, ERROR_CODES.PROVIDER_ERROR);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Nothing found.') {
    super(message, 404, ERROR_CODES.NOT_FOUND);
  }
}

/** What a client may see of an error: an AppError's code and message, anything else is internal. */
export function errorDetails(err: unknown): { code: ErrorCode; message: string } {
  if (err instanceof AppError) return { code: err.code, message: err.message };
  return { code: ERROR_CODES.INTERNAL, message: 'Something went wrong on our side.' };
}
