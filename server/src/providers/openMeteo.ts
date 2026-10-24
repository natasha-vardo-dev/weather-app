import { FORECAST_HOURS } from '@weather/shared';
import { ProviderError } from '../errors.js';
import type { Forecast, Location, WeatherProvider } from './types.js';

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

interface GeocodingResponse {
  results?: Array<{
    id: number;
    name: string;
    country?: string;
    admin1?: string;
    latitude: number;
    longitude: number;
    timezone?: string;
  }>;
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

type FetchFn = typeof fetch;

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
    return (data.results ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      country: r.country ?? '',
      region: r.admin1,
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone,
    }));
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

  private async request<T>(url: URL): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchFn(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new ProviderError();
    }
    if (!response.ok) {
      throw new ProviderError();
    }
    return (await response.json()) as T;
  }
}
