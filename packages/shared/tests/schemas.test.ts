import { describe, expect, it } from 'vitest';
import { FORECAST_DEFAULT_DAYS } from '../src/constants.js';
import { forecastQuerySchema, locationsQuerySchema } from '../src/schemas.js';

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
