import { describe, expect, it } from 'vitest';
import { convertTemperature, defaultTemperatureUnit, regionOf } from '../src/temperature.js';

describe('convertTemperature', () => {
  it('keeps Celsius as is', () => {
    expect(convertTemperature(14.6, 'celsius')).toBe(14.6);
  });

  it('converts to Fahrenheit', () => {
    expect(convertTemperature(0, 'fahrenheit')).toBe(32);
    expect(convertTemperature(100, 'fahrenheit')).toBe(212);
    expect(convertTemperature(-40, 'fahrenheit')).toBe(-40);
  });

  it('rounds correctly only when rounding happens after converting', () => {
    // 14.4 °C is 57.92 °F; rounding first (14 °C) would give 57.2 -> 57.
    expect(Math.round(convertTemperature(14.4, 'fahrenheit'))).toBe(58);
  });
});

describe('regionOf', () => {
  it.each([
    ['en-US', 'US'],
    ['en_us', 'US'],
    ['zh-Hant-TW', 'TW'],
    ['es-419', '419'],
    ['en', undefined],
    ['zh-Hans', undefined],
    ['en-u-ca-gregory', undefined],
  ])('%s -> %s', (tag, region) => {
    expect(regionOf(tag)).toBe(region);
  });
});

describe('defaultTemperatureUnit', () => {
  it('uses Fahrenheit when the locale and the time zone are both of a Fahrenheit region', () => {
    expect(defaultTemperatureUnit(['en-US'], 'America/Chicago')).toBe('fahrenheit');
    expect(defaultTemperatureUnit(['es-US', 'es'], 'America/Los_Angeles')).toBe('fahrenheit');
    expect(defaultTemperatureUnit(['en-US'], 'America/Indiana/Indianapolis')).toBe('fahrenheit');
    expect(defaultTemperatureUnit(['en-US'], 'Pacific/Honolulu')).toBe('fahrenheit');
    expect(defaultTemperatureUnit(['en-BS'], 'America/Nassau')).toBe('fahrenheit');
  });

  it('uses Celsius for the default "en-US" outside those regions', () => {
    expect(defaultTemperatureUnit(['en-US'], 'Europe/Warsaw')).toBe('celsius');
    expect(defaultTemperatureUnit(['en-US'], 'America/Toronto')).toBe('celsius');
    expect(defaultTemperatureUnit(['en-US'], 'America/Mexico_City')).toBe('celsius');
  });

  it('uses Celsius for other locales, even in the US', () => {
    expect(defaultTemperatureUnit(['en-GB'], 'Europe/London')).toBe('celsius');
    expect(defaultTemperatureUnit(['ru-RU', 'en-US'], 'America/New_York')).toBe('celsius');
    expect(defaultTemperatureUnit(['pl-PL'], 'America/Chicago')).toBe('celsius');
  });

  it('uses Celsius when the region or the time zone is unknown', () => {
    expect(defaultTemperatureUnit(['en', 'en-US'], 'America/Chicago')).toBe('celsius');
    expect(defaultTemperatureUnit([], 'America/Chicago')).toBe('celsius');
    expect(defaultTemperatureUnit(['en-US'], undefined)).toBe('celsius');
  });
});
