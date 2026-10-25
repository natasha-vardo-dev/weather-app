import { FORECAST_HOURS } from '@weather/shared';
import { ProviderError } from '../errors.js';
import type { AirQuality, Forecast, Location, WeatherProvider } from './types.js';

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const GEOCODING_GET_URL = 'https://geocoding-api.open-meteo.com/v1/get';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

interface GeocodingResult {
  id: number;
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

interface GeocodingResponse {
  results?: GeocodingResult[];
}

function toLocation(r: GeocodingResult): Location {
  return {
    id: r.id,
    name: r.name,
    country: r.country ?? '',
    region: r.admin1,
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone,
  };
}

interface ForecastResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current_units: { temperature_2m: string; wind_speed_10m: string };
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    weather_code: number;
    is_day: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation_probability: (number | null)[];
    is_day: number[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
  };
}

interface AirQualityResponse {
  timezone: string;
  current: {
    time: string;
    european_aqi: number | null;
    us_aqi: number | null;
    pm2_5: number | null;
    pm10: number | null;
    ozone: number | null;
    nitrogen_dioxide: number | null;
  };
}

type FetchFn = typeof fetch;

interface RequestOptions {
  /** Which failed responses mean "no such thing" (null) rather than a provider error. */
  isNotFound: (status: number, body: string) => boolean;
}

export class OpenMeteoProvider implements WeatherProvider {
  constructor(
    private readonly fetchFn: FetchFn = fetch,
    private readonly timeoutMs = 5000,
  ) {}

  async searchLocations(query: string, limit: number, language: string): Promise<Location[]> {
    const url = new URL(GEOCODING_URL);
    url.searchParams.set('name', query);
    url.searchParams.set('count', String(limit));
    url.searchParams.set('language', language);
    url.searchParams.set('format', 'json');

    const data = await this.request<GeocodingResponse>(url);
    return (data.results ?? []).map(toLocation);
  }

  /** Used to show a saved place's name in the current language. */
  async getLocation(id: number, language: string): Promise<Location | null> {
    const url = new URL(GEOCODING_GET_URL);
    url.searchParams.set('id', String(id));
    url.searchParams.set('language', language);
    // Open-Meteo answers an unknown id with 400 {"reason": "Location ID not found."}. Other
    // 400s (a parameter it rejects, say after an API change) stay errors: as "not found"
    // they would be cached for a day and never reach the log.
    const data = await this.request<GeocodingResult>(url, {
      isNotFound: (status, body) => status === 400 && /location id not found/i.test(body),
    });
    return data ? toLocation(data) : null;
  }

  async getForecast(latitude: number, longitude: number, days: number): Promise<Forecast> {
    const url = new URL(FORECAST_URL);
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set(
      'current',
      'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day',
    );
    url.searchParams.set(
      'hourly',
      'temperature_2m,weather_code,precipitation_probability,is_day',
    );
    // Hourly data starts at the current hour, unlike daily data.
    url.searchParams.set('forecast_hours', String(FORECAST_HOURS));
    url.searchParams.set(
      'daily',
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    );
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', String(days));
    url.searchParams.set('past_days', '1');

    const data = await this.request<ForecastResponse>(url);
    const { current, hourly, daily } = data;

    const allDays = daily.time.map((date, i) => ({
      date,
      weatherCode: daily.weather_code[i],
      tempMax: daily.temperature_2m_max[i],
      tempMin: daily.temperature_2m_min[i],
      precipitationProbability: daily.precipitation_probability_max[i] ?? null,
    }));
    // Dates are local to the place (timezone=auto), so its "today" comes from the current time.
    const today = current.time.slice(0, 10);
    const pastDays = allDays.filter((day) => day.date < today);

    return {
      latitude: data.latitude,
      longitude: data.longitude,
      timezone: data.timezone,
      units: {
        temperature: data.current_units.temperature_2m,
        windSpeed: data.current_units.wind_speed_10m,
      },
      current: {
        time: current.time,
        temperature: current.temperature_2m,
        apparentTemperature: current.apparent_temperature,
        humidity: current.relative_humidity_2m,
        windSpeed: current.wind_speed_10m,
        weatherCode: current.weather_code,
        isDay: current.is_day === 1,
      },
      hourly: hourly.time.map((time, i) => ({
        time,
        temperature: hourly.temperature_2m[i],
        weatherCode: hourly.weather_code[i],
        precipitationProbability: hourly.precipitation_probability[i] ?? null,
        isDay: hourly.is_day[i] === 1,
      })),
      yesterday: pastDays.at(-1) ?? null,
      daily: allDays.filter((day) => day.date >= today),
    };
  }

  /** A separate Open-Meteo API (other host), so it is a separate call with its own cache. */
  async getAirQuality(latitude: number, longitude: number): Promise<AirQuality> {
    const url = new URL(AIR_QUALITY_URL);
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    // Pollutants come in the same call, so the details cost no extra provider request.
    url.searchParams.set('current', 'european_aqi,us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide');
    url.searchParams.set('timezone', 'auto');

    const data = await this.request<AirQualityResponse>(url);
    const { current } = data;
    return {
      time: current.time,
      timezone: data.timezone,
      europeanAqi: current.european_aqi ?? null,
      usAqi: current.us_aqi ?? null,
      pollutants: {
        pm2_5: current.pm2_5 ?? null,
        pm10: current.pm10 ?? null,
        ozone: current.ozone ?? null,
        nitrogenDioxide: current.nitrogen_dioxide ?? null,
      },
    };
  }

  /**
   * Node's fetch reports every network failure as "TypeError: fetch failed"; the real
   * reason (DNS, refused or reset connection, TLS) is in `cause`, often with a code.
   */
  private describeFailure(err: unknown): string {
    if (err instanceof Error && err.name === 'TimeoutError') return `timeout after ${this.timeoutMs} ms`;
    const cause = err instanceof Error ? (err.cause as { code?: string; message?: string } | undefined) : undefined;
    const detail = cause ? [cause.code, cause.message].filter(Boolean).join(' ') : '';
    return detail ? `${String(err)} (${detail})` : String(err);
  }

  private async request<T>(url: URL): Promise<T>;
  private async request<T>(url: URL, options: RequestOptions): Promise<T | null>;
  private async request<T>(url: URL, options?: RequestOptions): Promise<T | null> {
    let response: Response;
    const where = `${url.host}${url.pathname}`;
    try {
      response = await this.fetchFn(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (err) {
      throw new ProviderError(`${where}: ${this.describeFailure(err)}`);
    }
    if (!response.ok) {
      // Open-Meteo explains failures in {"reason": "..."}, e.g. "Minutely API request limit exceeded".
      const body = await response.text().catch(() => '');
      if (options?.isNotFound(response.status, body)) return null;
      throw new ProviderError(`${where}: HTTP ${response.status} ${body.slice(0, 200)}`.trim());
    }
    return (await response.json()) as T;
  }
}
