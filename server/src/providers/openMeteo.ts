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
  admin2?: string;
  admin3?: string;
  admin4?: string;
  /** GeoNames feature code: PPL… for settlements, ISL for an island, ADM… for areas. */
  feature_code?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

interface GeocodingResponse {
  results?: GeocodingResult[];
}

/** admin2–admin4 with '' for gaps (positions matter), trailing gaps dropped; none at all: no field. */
function areasOf(r: GeocodingResult): { areas?: string[] } {
  const areas = [r.admin2, r.admin3, r.admin4].map((area) => area ?? '');
  while (areas.length && !areas[areas.length - 1]) areas.pop();
  return areas.length ? { areas } : {};
}

function toLocation(r: GeocodingResult): Location {
  return {
    id: r.id,
    name: r.name,
    country: r.country ?? '',
    region: r.admin1,
    ...areasOf(r),
    // Islands (ISL, ISLS, ISLET, …) and atolls: a search for "Rhodes" returns the town and
    // the island, same name, same region.
    ...(/^(ISL|ATOL)/.test(r.feature_code ?? '') ? { kind: 'island' as const } : {}),
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone,
  };
}

interface ForecastResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current_units: { temperature_2m: string };
  hourly_units: { wind_speed_10m: string; precipitation?: string };
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    wind_direction_10m?: number | null;
    weather_code: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    wind_speed_10m: number[];
    wind_gusts_10m?: (number | null)[];
    weather_code: number[];
    precipitation_probability: (number | null)[];
    precipitation?: (number | null)[];
    uv_index?: (number | null)[];
    pressure_msl?: (number | null)[];
    visibility?: (number | null)[];
    dew_point_2m?: (number | null)[];
    is_day: number[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
    sunrise?: (string | null)[];
    sunset?: (string | null)[];
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
  isNotFound?: (status: number, body: string) => boolean;
  /** Instead of the provider's usual timeout. */
  timeoutMs?: number;
}

export class OpenMeteoProvider implements WeatherProvider {
  /**
   * @param airQualityTimeoutMs Longer than the rest: the air quality API is slower (seen
   *   past 5 s on a cache miss), and its answer is secondary and loaded apart from the
   *   forecast, so waiting holds nothing up, while giving up hid the item until the client's
   *   retry 20 s later.
   */
  constructor(
    private readonly fetchFn: FetchFn = fetch,
    private readonly timeoutMs = 5000,
    private readonly airQualityTimeoutMs = 10_000,
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
    // Each variable costs: Open-Meteo counts a request with more than 10 as several calls (2.6
    // with 26, 2.2 with 22). So "now" asks only for what the hourly data has not: humidity,
    // wind and gusts now are the current hour's, and day or night comes from today's sunrise
    // and sunset. The temperature and the weather stay here: per 15 minutes, they are what
    // the page is for.
    url.searchParams.set('current', 'temperature_2m,apparent_temperature,wind_direction_10m,weather_code');
    url.searchParams.set(
      'hourly',
      // The same request, more fields: the tiles below the 10-day forecast and their charts.
      'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code,precipitation_probability,precipitation,uv_index,pressure_msl,visibility,dew_point_2m,is_day',
    );
    // Hourly data starts at the current hour, unlike daily data.
    url.searchParams.set('forecast_hours', String(FORECAST_HOURS));
    url.searchParams.set(
      'daily',
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    );
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', String(days));
    url.searchParams.set('past_days', '1');

    const data = await this.request<ForecastResponse>(url);
    const { current, hourly, daily } = data;
    // Hourly data starts at the current hour (forecast_hours), so its first entry is "now".
    const thisHour = 0;

    const allDays = daily.time.map((date, i) => ({
      date,
      weatherCode: daily.weather_code[i],
      tempMax: daily.temperature_2m_max[i],
      tempMin: daily.temperature_2m_min[i],
      precipitationProbability: daily.precipitation_probability_max[i] ?? null,
      // Empty in polar day or night: no sunrise that day.
      sunrise: daily.sunrise?.[i] || null,
      sunset: daily.sunset?.[i] || null,
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
        windSpeed: data.hourly_units.wind_speed_10m,
        precipitation: data.hourly_units.precipitation ?? 'mm',
      },
      current: {
        time: current.time,
        temperature: current.temperature_2m,
        apparentTemperature: current.apparent_temperature,
        humidity: hourly.relative_humidity_2m[thisHour]!,
        windSpeed: hourly.wind_speed_10m[thisHour]!,
        windGusts: hourly.wind_gusts_10m?.[thisHour] ?? null,
        windDirection: current.wind_direction_10m ?? null,
        weatherCode: current.weather_code,
        isDay: isDaytime(
          current.time,
          allDays.find((day) => day.date === today),
          hourly.is_day[thisHour] === 1,
        ),
      },
      hourly: hourly.time.map((time, i) => ({
        time,
        temperature: hourly.temperature_2m[i],
        humidity: hourly.relative_humidity_2m[i],
        windSpeed: hourly.wind_speed_10m[i],
        windGusts: hourly.wind_gusts_10m?.[i] ?? null,
        weatherCode: hourly.weather_code[i],
        precipitationProbability: hourly.precipitation_probability[i] ?? null,
        precipitation: hourly.precipitation?.[i] ?? null,
        uvIndex: hourly.uv_index?.[i] ?? null,
        pressure: hourly.pressure_msl?.[i] ?? null,
        visibility: hourly.visibility?.[i] ?? null,
        dewPoint: hourly.dew_point_2m?.[i] ?? null,
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

    const data = await this.request<AirQualityResponse>(url, { timeoutMs: this.airQualityTimeoutMs });
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
  private describeFailure(err: unknown, timeoutMs: number): string {
    if (err instanceof Error && err.name === 'TimeoutError') return `timeout after ${timeoutMs} ms`;
    const cause = err instanceof Error ? (err.cause as { code?: string; message?: string } | undefined) : undefined;
    const detail = cause ? [cause.code, cause.message].filter(Boolean).join(' ') : '';
    return detail ? `${String(err)} (${detail})` : String(err);
  }

  private async request<T>(url: URL, options?: RequestOptions & { isNotFound?: undefined }): Promise<T>;
  private async request<T>(url: URL, options: RequestOptions): Promise<T | null>;
  private async request<T>(url: URL, options?: RequestOptions): Promise<T | null> {
    let response: Response;
    const where = `${url.host}${url.pathname}`;
    const timeoutMs = options?.timeoutMs ?? this.timeoutMs;
    try {
      response = await this.fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new ProviderError(`${where}: ${this.describeFailure(err, timeoutMs)}`);
    }
    if (!response.ok) {
      // Open-Meteo explains failures in {"reason": "..."}, e.g. "Minutely API request limit exceeded".
      const body = await response.text().catch(() => '');
      if (options?.isNotFound?.(response.status, body)) return null;
      throw new ProviderError(`${where}: HTTP ${response.status} ${body.slice(0, 200)}`.trim());
    }
    return (await response.json()) as T;
  }
}

/**
 * Day or night now, from today's sunrise and sunset (local times, "2026-10-31T06:40", so
 * they compare as strings): exact to the minute, where the hourly flag would keep the night
 * icon until the hour after sunrise. Without a sunrise or sunset (polar day or night), the
 * current hour's flag.
 */
export function isDaytime(
  now: string,
  today: { sunrise: string | null; sunset: string | null } | undefined,
  hourFlag: boolean,
): boolean {
  if (!today?.sunrise || !today.sunset) return hourFlag;
  return now >= today.sunrise && now < today.sunset;
}
