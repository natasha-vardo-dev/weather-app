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
  it('uses Fahrenheit for the US and similar regions', () => {
    expect(defaultTemperatureUnit(['en-US'])).toBe('fahrenheit');
    expect(defaultTemperatureUnit(['es-US', 'es'])).toBe('fahrenheit');
    expect(defaultTemperatureUnit(['en-BS'])).toBe('fahrenheit');
  });

  it('uses Celsius elsewhere', () => {
    expect(defaultTemperatureUnit(['en-GB'])).toBe('celsius');
    expect(defaultTemperatureUnit(['ru-RU', 'en-US'])).toBe('celsius');
  });

  it('uses Celsius when the first locale has no region or there is none', () => {
    expect(defaultTemperatureUnit(['en', 'en-US'])).toBe('celsius');
    expect(defaultTemperatureUnit([])).toBe('celsius');
  });
});
