import { API_PREFIX, FORECAST_DEFAULT_DAYS } from './constants.js';
import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from './errors.js';
import type { AlertsResponse } from './alerts.js';
import type { AlertTopicsRequest, AlertTopicsResponse } from './push.js';
import {
  isAirQuality,
  isAlertsResponse,
  isAlertTopicsResponse,
  isForecast,
  isForecastsResponse,
  isLocation,
  isLocationsResponse,
  isReversePlace,
} from './responseChecks.js';
import type { AirQuality, Forecast, ForecastsResponse, Location, LocationsResponse, ReversePlace } from './types.js';

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
  async function send(path: string, signal: AbortSignal | undefined, body: unknown, reload: boolean) {
    try {
      return await fetchFn(
        `${baseUrl}${path}`,
        body === undefined
          ? { signal, ...(reload ? { cache: 'reload' as const } : {}) }
          : { signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      );
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      throw new ApiError(
        'No connection to the server. Check your internet and try again.',
        ERROR_CODES.NETWORK_ERROR,
        0,
      );
    }
  }

  /**
   * An answer of the wrong shape (`check` fails) is asked for once more past the browser's HTTP
   * cache, where such answers usually come from (one kept from before a field existed); if the
   * fresh one is no better, it is an error like any other, not a crash in the page reading it.
   * Not for POST: nothing caches it.
   */
  async function request<T>(path: string, check: (body: unknown) => boolean, signal?: AbortSignal, body?: unknown) {
    for (let reload = false; ; reload = true) {
      const response = await send(path, signal, body, reload);
      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as ApiErrorBody | null;
        throw new ApiError(
          error?.error?.message ?? 'Something went wrong. Try again.',
          error?.error?.code ?? ERROR_CODES.INTERNAL,
          response.status,
        );
      }
      const data: unknown = await response.json().catch(() => undefined);
      if (check(data)) return data as T;
      if (reload || body !== undefined) {
        throw new ApiError(
          'The server sent an answer this app cannot read. Try again later.',
          ERROR_CODES.INTERNAL,
          response.status,
        );
      }
    }
  }

  return {
    async searchLocations(
      query: string,
      options: { language?: string; signal?: AbortSignal } = {},
    ): Promise<Location[]> {
      const { language, signal } = options;
      const params = new URLSearchParams({ q: query });
      if (language) params.set('lang', language);
      const data = await request<LocationsResponse>(`${API_PREFIX}/locations?${params}`, isLocationsResponse, signal);
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
      return request<Forecast>(`${API_PREFIX}/forecast?${params}`, isForecast, options.signal);
    },

    /** Several places in one request (saved cities); each result is a forecast or an error. */
    getForecasts(
      places: { latitude: number; longitude: number }[],
      options: { days?: number; signal?: AbortSignal } = {},
    ): Promise<ForecastsResponse> {
      const params = new URLSearchParams({
        places: places.map((p) => `${p.latitude},${p.longitude}`).join(';'),
        days: String(options.days ?? FORECAST_DEFAULT_DAYS),
      });
      return request<ForecastsResponse>(`${API_PREFIX}/forecasts?${params}`, isForecastsResponse, options.signal);
    },

    /** One place by provider id, with names in `language`. */
    getLocation(id: number, options: { language?: string; signal?: AbortSignal } = {}): Promise<Location> {
      const params = new URLSearchParams();
      if (options.language) params.set('lang', options.language);
      const query = params.toString();
      return request<Location>(`${API_PREFIX}/locations/${id}${query ? `?${query}` : ''}`, isLocation, options.signal);
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
      return request<ReversePlace>(`${API_PREFIX}/places/reverse?${params}`, isReversePlace, options.signal);
    },

    /**
     * The user's city guessed from their IP address, for when the browser can't locate
     * them: city level, can be wrong behind a VPN. Rejects with 404 if it can't be told.
     */
    approximateLocation(options: { language?: string; signal?: AbortSignal } = {}): Promise<ReversePlace> {
      const params = new URLSearchParams();
      if (options.language) params.set('lang', options.language);
      const query = params.toString();
      return request<ReversePlace>(
        `${API_PREFIX}/places/approximate${query ? `?${query}` : ''}`,
        isReversePlace,
        options.signal,
      );
    },

    getAirQuality(latitude: number, longitude: number, signal?: AbortSignal): Promise<AirQuality> {
      const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude) });
      return request<AirQuality>(`${API_PREFIX}/air-quality?${params}`, isAirQuality, signal);
    },

    /** Official weather warnings at a place (Europe only for now), texts in `language` where available. */
    getAlerts(
      latitude: number,
      longitude: number,
      options: { language?: string; signal?: AbortSignal } = {},
    ): Promise<AlertsResponse> {
      const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude) });
      if (options.language) params.set('lang', options.language);
      return request<AlertsResponse>(`${API_PREFIX}/alerts?${params}`, isAlertsResponse, options.signal);
    },

    /** Subscribes (or unsubscribes) a device's push token to warnings for a place. */
    setAlertTopics(body: AlertTopicsRequest): Promise<AlertTopicsResponse> {
      return request<AlertTopicsResponse>(`${API_PREFIX}/push/topics`, isAlertTopicsResponse, undefined, body);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
