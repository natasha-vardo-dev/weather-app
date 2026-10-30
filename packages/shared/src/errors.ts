export const ERROR_CODES = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL: 'INTERNAL',
  /** Too many requests from one address (429); the RateLimit headers say when to try again. */
  RATE_LIMITED: 'RATE_LIMITED',
  /** Client-side only: the request never reached the server. */
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Shape of every error response returned by the API. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
  };
}

/** Errors worth retrying automatically or offering a "Try again" button for. */
export function isRetryable(code: ErrorCode): boolean {
  return code === ERROR_CODES.PROVIDER_ERROR || code === ERROR_CODES.NETWORK_ERROR || code === ERROR_CODES.RATE_LIMITED;
}
