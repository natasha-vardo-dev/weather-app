import { FORECAST_DEFAULT_DAYS } from './constants.js';
import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from './errors.js';
import type { Forecast, Location, LocationsResponse } from './types.js';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  /** e.g. "" for same-origin web, "https://api.example.com" for mobile */
  baseUrl: string;
  fetchFn?: typeof fetch;
}

/**
 * Environment-neutral API client: works in browsers, Node.js and React Native.
 * Each app passes its own base URL.
 */
export function createApiClient({ baseUrl, fetchFn = (...args) => fetch(...args) }: ApiClientOptions) {
  async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}${path}`, { signal });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      throw new ApiError(
        'No connection to the server. Check your internet and try again.',
        ERROR_CODES.NETWORK_ERROR,
        0,
      );
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
      throw new ApiError(
        body?.error?.message ?? 'Something went wrong. Try again.',
        body?.error?.code ?? ERROR_CODES.INTERNAL,
        response.status,
      );
    }
    return (await response.json()) as T;
  }

  return {
    async searchLocations(query: string, signal?: AbortSignal): Promise<Location[]> {
      const params = new URLSearchParams({ q: query });
      const data = await request<LocationsResponse>(`/api/locations?${params}`, signal);
      return data.locations;
    },

    getForecast(
      latitude: number,
      longitude: number,
      options: { days?: number; signal?: AbortSignal } = {},
    ): Promise<Forecast> {
      const params = new URLSearchParams({
        lat: String(latitude),
        lon: String(longitude),
        days: String(options.days ?? FORECAST_DEFAULT_DAYS),
      });
      return request<Forecast>(`/api/forecast?${params}`, options.signal);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
