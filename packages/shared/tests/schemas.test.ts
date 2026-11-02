import { describe, expect, it } from 'vitest';
import { FORECAST_DEFAULT_DAYS } from '../src/constants.js';
import { forecastQuerySchema, forecastsQuerySchema, locationsQuerySchema } from '../src/schemas.js';

describe('forecastQuerySchema', () => {
  it('coerces strings from the URL and applies defaults', () => {
    expect(forecastQuerySchema.parse({ lat: '52.23', lon: '21.01' })).toEqual({
      lat: 52.23,
      lon: 21.01,
      days: FORECAST_DEFAULT_DAYS,
    });
  });

  it('rejects out-of-range values', () => {
    expect(forecastQuerySchema.safeParse({ lat: '91', lon: '0' }).success).toBe(false);
    expect(forecastQuerySchema.safeParse({ lat: '0', lon: '0', days: '17' }).success).toBe(false);
  });

  // Number('') is 0: without the check, ?lat=&lon= was a forecast for 0, 0 (a provider call).
  it('rejects empty, blank and missing coordinates instead of reading them as 0', () => {
    expect(forecastQuerySchema.safeParse({ lat: '', lon: '' }).success).toBe(false);
    expect(forecastQuerySchema.safeParse({ lat: ' ', lon: '21.01' }).success).toBe(false);
    expect(forecastQuerySchema.safeParse({ lon: '21.01' }).success).toBe(false);
    expect(forecastQuerySchema.parse({ lat: '0', lon: '0' })).toMatchObject({ lat: 0, lon: 0 });
  });
});

describe('forecastsQuerySchema', () => {
  it('reads a list of places', () => {
    expect(forecastsQuerySchema.parse({ places: '52.23,21.01;50.06,19.94' }).places).toEqual([
      { lat: 52.23, lon: 21.01 },
      { lat: 50.06, lon: 19.94 },
    ]);
  });

  it('rejects a place with an empty or missing half', () => {
    for (const places of [',', '52.23,', ',21.01', '52.23', '52.23,21.01;']) {
      expect(forecastsQuerySchema.safeParse({ places }).success, places).toBe(false);
    }
  });
});

describe('locationsQuerySchema', () => {
  it('defaults the place-name language to English and normalises it', () => {
    expect(locationsQuerySchema.parse({ q: 'Warsaw' }).lang).toBe('en');
    expect(locationsQuerySchema.parse({ q: 'Warsaw', lang: 'PL' }).lang).toBe('pl');
    expect(locationsQuerySchema.safeParse({ q: 'Warsaw', lang: 'pl-PL' }).success).toBe(false);
  });

  it('trims the query and requires 2+ characters', () => {
    expect(locationsQuerySchema.parse({ q: '  wa ' }).q).toBe('wa');
    expect(locationsQuerySchema.safeParse({ q: ' w ' }).success).toBe(false);
  });
});

describe('isValidCoordinates', () => {
  it('accepts the edges and rejects anything outside or not a number', async () => {
    const { isValidCoordinates } = await import('../src/coordinates.js');
    expect(isValidCoordinates(90, -180)).toBe(true);
    expect(isValidCoordinates(90.01, 0)).toBe(false);
    expect(isValidCoordinates(Number.NaN, 0)).toBe(false);
  });
});
