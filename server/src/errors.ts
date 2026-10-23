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
  constructor(message = 'The weather service is not responding. Try again in a minute.') {
    super(message, 502, ERROR_CODES.PROVIDER_ERROR);
  }
}
