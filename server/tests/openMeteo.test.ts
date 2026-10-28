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
          relative_humidity_2m: [80, 75],
          wind_speed_10m: [14, 16.2],
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
      {
        time: '2026-10-15T12:00',
        temperature: 12,
        humidity: 80,
        windSpeed: 14,
        weatherCode: 61,
        precipitationProbability: 80,
        isDay: true,
      },
      {
        time: '2026-10-15T13:00',
        temperature: 13,
        humidity: 75,
        windSpeed: 16.2,
        weatherCode: 3,
        precipitationProbability: null,
        isDay: true,
      },
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

  it('maps the air quality response, keeping missing values as null', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        timezone: 'Europe/Warsaw',
        current: {
          time: '2026-10-24T19:00',
          european_aqi: 54,
          us_aqi: null,
          pm2_5: 38.7,
          pm10: 60.9,
          ozone: 23,
          nitrogen_dioxide: null,
        },
      }),
    );
    const provider = new OpenMeteoProvider(fetchFn as unknown as typeof fetch);

    expect(await provider.getAirQuality(52.23, 21.01)).toEqual({
      time: '2026-10-24T19:00',
      timezone: 'Europe/Warsaw',
      europeanAqi: 54,
      usAqi: null,
      pollutants: { pm2_5: 38.7, pm10: 60.9, ozone: 23, nitrogenDioxide: null },
    });
    const url = new URL(String((fetchFn.mock.calls[0] as unknown[])[0]));
    expect(url.host).toBe('air-quality-api.open-meteo.com');
  });

  it('gets a place by id in a language, and null for an unknown id', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ id: 756135, name: 'Варшава', country: 'Польша', latitude: 52.2, longitude: 21 }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: true, reason: 'Location ID not found.' }, 400));
    const provider = new OpenMeteoProvider(fetchFn as unknown as typeof fetch);

    expect(await provider.getLocation(756135, 'ru')).toMatchObject({ name: 'Варшава', country: 'Польша' });
    const url = new URL(String(fetchFn.mock.calls[0][0]));
    expect(url.pathname).toBe('/v1/get');
    expect(url.searchParams.get('language')).toBe('ru');
    expect(await provider.getLocation(1, 'ru')).toBeNull();
  });

  it('treats other 400s from the id lookup as provider errors, not "not found"', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: true, reason: "Value was not of type 'Int32' at path 'id'." }, 400),
    );
    const provider = new OpenMeteoProvider(fetchFn as unknown as typeof fetch);
    const err = await provider.getLocation(756135, 'ru').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).detail).toMatch(/HTTP 400 .*Int32/);
  });

  it('marks islands and passes the levels below the region, so same-named places can be told apart', async () => {
    // Open-Meteo's answer for "родос" (ru), trimmed: the town, then the island.
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        results: [
          { id: 400666, name: 'Родос', feature_code: 'PPLA2', admin1: 'South Aegean', admin2: 'Dodecanese', country: 'Греция', latitude: 36.43556, longitude: 28.22199 },
          { id: 400665, name: 'Родос', feature_code: 'ISL', admin1: 'South Aegean', admin2: 'Dodecanese', country: 'Греция', latitude: 36.19613, longitude: 27.96081 },
        ],
      }),
    );
    const provider = new OpenMeteoProvider(fetchFn as unknown as typeof fetch);
    const [town, island] = await provider.searchLocations('родос', 5, 'ru');
    expect(town).toMatchObject({ name: 'Родос', areas: ['Dodecanese'] });
    expect(town).not.toHaveProperty('kind');
    expect(island).toMatchObject({ name: 'Родос', kind: 'island' });
  });

  it('keeps gaps between levels, so the same level is compared across places', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        results: [
          { id: 2847562, name: 'Rhode', admin1: 'Lower Saxony', admin3: 'Helmstedt (district)', admin4: 'Königslutter am Elm', country: 'Germany', latitude: 52.3, longitude: 10.87 },
          { id: 2961832, name: 'Rhode', admin1: 'Leinster', country: 'Ireland', latitude: 53.35, longitude: -7.2 },
        ],
      }),
    );
    const provider = new OpenMeteoProvider(fetchFn as unknown as typeof fetch);
    const [german, irish] = await provider.searchLocations('rhode', 5, 'en');
    expect(german!.areas).toEqual(['', 'Helmstedt (district)', 'Königslutter am Elm']);
    expect(irish).not.toHaveProperty('areas');
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

  it('keeps the reason of a failure for the server log', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: true, reason: 'Minutely API request limit exceeded' }, 429),
    );
    const provider = new OpenMeteoProvider(fetchFn as unknown as typeof fetch);
    const err = await provider.searchLocations('Warsaw', 5, 'en').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).detail).toMatch(/HTTP 429 .*Minutely API request limit exceeded/);
  });

  it('reports the cause of a network failure', async () => {
    const fetchFn = vi.fn(async () => {
      const cause = Object.assign(new Error('getaddrinfo ENOTFOUND example.com'), { code: 'ENOTFOUND' });
      throw new TypeError('fetch failed', { cause });
    });
    const provider = new OpenMeteoProvider(fetchFn as unknown as typeof fetch);
    const err = await provider.searchLocations('Warsaw', 5, 'en').catch((e: unknown) => e);
    expect((err as ProviderError).detail).toMatch(/fetch failed \(ENOTFOUND getaddrinfo ENOTFOUND/);
  });

  it('reports a timeout as such', async () => {
    const fetchFn = vi.fn(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    const provider = new OpenMeteoProvider(fetchFn as unknown as typeof fetch);
    const err = await provider.searchLocations('Warsaw', 5, 'en').catch((e: unknown) => e);
    expect((err as ProviderError).detail).toMatch(/timeout after 5000 ms/);
  });
});
