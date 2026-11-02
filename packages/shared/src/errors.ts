export const ERROR_CODES = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL: 'INTERNAL',
  /** Too many requests from one address (429); the RateLimit headers say when to try again. */
  RATE_LIMITED: 'RATE_LIMITED',
  /**
   * The server is near a data provider's limit for everyone (503): new data waits, what is
   * cached is still served. Not the user's doing, unlike RATE_LIMITED.
   */
  SERVICE_BUSY: 'SERVICE_BUSY',
  /**
   * Client-side only: the request never reached the API, or its answer never came back (no
   * network, or no answer within the client's timeout).
   */
  NETWORK_ERROR: 'NETWORK_ERROR',
  /**
   * Client-side only: the site answered but the API behind it did not, a 5xx from the proxy in
   * front of it with no API error body (the API down, restarting or unreachable). Unlike
   * NETWORK_ERROR the user's connection works, so they are not told to check it.
   */
  SERVER_UNAVAILABLE: 'SERVER_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** The codes an API answer can carry: SERVER_UNAVAILABLE is made by the client only. */
export type ApiErrorCode = Exclude<ErrorCode, typeof ERROR_CODES.SERVER_UNAVAILABLE>;

/** Shape of every error response returned by the API. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

/** Errors worth retrying automatically or offering a "Try again" button for. */
export function isRetryable(code: ErrorCode): boolean {
  return (
    code === ERROR_CODES.PROVIDER_ERROR ||
    code === ERROR_CODES.NETWORK_ERROR ||
    code === ERROR_CODES.SERVER_UNAVAILABLE ||
    code === ERROR_CODES.RATE_LIMITED ||
    code === ERROR_CODES.SERVICE_BUSY
  );
}
