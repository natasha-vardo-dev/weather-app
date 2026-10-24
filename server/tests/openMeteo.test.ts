import { describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../src/errors.js';
import { OpenMeteoProvider } from '../src/providers/openMeteo.js';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OpenMeteoProvider', () => {
  it('maps the forecast response to our model', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        latitude: 52.25,
        longitude: 21,
        timezone: 'Europe/Warsaw',
        current_units: { temperature_2m: '°C', wind_speed_10m: 'km/h' },
        current: {
          time: '2026-10-15T12:00',
          temperature_2m: 12,
          apparent_temperature: 10,
          relative_humidity_2m: 70,
          wind_speed_10m: 15,
          weather_code: 61,
          is_day: 1,
        },
        hourly: {
          time: ['2026-10-15T12:00', '2026-10-15T13:00'],
          temperature_2m: [12, 13],
          weather_code: [61, 3],
          precipitation_probability: [80, null],
          is_day: [1, 1],
        },
        daily: {
          time: ['2026-10-14', '2026-10-15'],
          weather_code: [3, 61],
          temperature_2m_max: [11, 14],
          temperature_2m_min: [5, 7],
          precipitation_probability_max: [null, 80],
        },
      }),
    );

    const provider = new OpenMeteoProvider(fetchFn as unknown as typeof fetch);
    const forecast = await provider.getForecast(52.23, 21.01, 1);

    const url = new URL(String((fetchFn.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('past_days')).toBe('1');
    expect(url.searchParams.get('forecast_hours')).toBe('24');
    expect(forecast.current).toMatchObject({ temperature: 12, weatherCode: 61, isDay: true });
    expect(forecast.hourly).toEqual([
      { time: '2026-10-15T12:00', temperature: 12, weatherCode: 61, precipitationProbability: 80, isDay: true },
      { time: '2026-10-15T13:00', temperature: 13, weatherCode: 3, precipitationProbability: null, isDay: true },
    ]);
    expect(forecast.yesterday).toEqual({
      date: '2026-10-14',
      weatherCode: 3,
      tempMax: 11,
      tempMin: 5,
      precipitationProbability: null,
    });
    expect(forecast.daily).toEqual([
      { date: '2026-10-15', weatherCode: 61, tempMax: 14, tempMin: 7, precipitationProbability: 80 },
    ]);
  });

  it('returns an empty list when no city is found', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}));
    const provider = new OpenMeteoProvider(fetchFn as unknown as typeof fetch);
    expect(await provider.searchLocations('zzzz', 5, 'pl')).toEqual([]);
    const url = new URL(String((fetchFn.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('language')).toBe('pl');
  });

  it('throws ProviderError on a failed response', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ error: true }, 500));
    const provider = new OpenMeteoProvider(fetchFn as unknown as typeof fetch);
    await expect(provider.searchLocations('Warsaw', 5, 'en')).rejects.toBeInstanceOf(ProviderError);
  });
});
