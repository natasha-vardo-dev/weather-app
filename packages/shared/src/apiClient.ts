import { FORECAST_DEFAULT_DAYS } from './constants.js';
import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from './errors.js';
import type { AirQuality, Forecast, Location, LocationsResponse, ReversePlace } from './types.js';

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
    async searchLocations(
      query: string,
      options: { language?: string; signal?: AbortSignal } = {},
    ): Promise<Location[]> {
      const { language, signal } = options;
      const params = new URLSearchParams({ q: query });
      if (language) params.set('lang', language);
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

    /** One place by provider id, with names in `language`. */
    getLocation(id: number, options: { language?: string; signal?: AbortSignal } = {}): Promise<Location> {
      const params = new URLSearchParams();
      if (options.language) params.set('lang', options.language);
      const query = params.toString();
      return request<Location>(`/api/locations/${id}${query ? `?${query}` : ''}`, options.signal);
    },

    /**
     * The place at coordinates (the user's location), named in `language`; the city's own
     * coordinates and id when it is known to search. Rejects with 404 if there is none.
     */
    reverseGeocode(
      latitude: number,
      longitude: number,
      options: { language?: string; signal?: AbortSignal } = {},
    ): Promise<ReversePlace> {
      const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude) });
      if (options.language) params.set('lang', options.language);
      return request<ReversePlace>(`/api/places/reverse?${params}`, options.signal);
    },

    /**
     * The user's city guessed from their IP address, for when the browser can't locate
     * them: city level, can be wrong behind a VPN. Rejects with 404 if it can't be told.
     */
    approximateLocation(options: { language?: string; signal?: AbortSignal } = {}): Promise<ReversePlace> {
      const params = new URLSearchParams();
      if (options.language) params.set('lang', options.language);
      const query = params.toString();
      return request<ReversePlace>(`/api/places/approximate${query ? `?${query}` : ''}`, options.signal);
    },

    getAirQuality(latitude: number, longitude: number, signal?: AbortSignal): Promise<AirQuality> {
      const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude) });
      return request<AirQuality>(`/api/air-quality?${params}`, signal);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
