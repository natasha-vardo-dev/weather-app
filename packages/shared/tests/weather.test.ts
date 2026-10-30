import { describe, expect, it } from 'vitest';
import { compareWithYesterday, describeWeather, formatDay, formatHour, rangePosition } from '../src/weather.js';

describe('describeWeather', () => {
  it('maps WMO codes to condition keys and icons', () => {
    expect(describeWeather(0)).toEqual({ condition: 'clear-sky', icon: 'clear' });
    expect(describeWeather(2).icon).toBe('partly-cloudy');
    expect(describeWeather(53)).toEqual({ condition: 'drizzle', icon: 'drizzle' });
    expect(describeWeather(81)).toEqual({ condition: 'rain-showers', icon: 'rain' });
    expect(describeWeather(86).icon).toBe('snow');
    expect(describeWeather(95).condition).toBe('thunderstorm');
  });

  it('falls back for unknown codes', () => {
    expect(describeWeather(10).condition).toBe('unknown');
  });
});

describe('rangePosition', () => {
  it('places a day inside the week range', () => {
    expect(rangePosition(5, 10, 0, 20)).toEqual({ left: 25, width: 25 });
  });

  it('keeps a minimum width and stays inside the bar', () => {
    const { left, width } = rangePosition(20, 20, 0, 20);
    expect(width).toBe(4);
    expect(left + width).toBeLessThanOrEqual(100);
  });
});

describe('compareWithYesterday', () => {
  it('reports warmer and cooler days in whole degrees', () => {
    expect(compareWithYesterday(17, 14)).toEqual({ trend: 'warmer', difference: 3 });
    expect(compareWithYesterday(12, 15)).toEqual({ trend: 'cooler', difference: 3 });
  });

  it('compares the rounded values shown on screen', () => {
    // 16.4 and 15.6 both display as 16°, so "1° warmer" would contradict the screen.
    expect(compareWithYesterday(16.4, 15.6)).toEqual({ trend: 'same', difference: 0 });
    expect(compareWithYesterday(16.5, 16.4)).toEqual({ trend: 'warmer', difference: 1 });
  });
});

describe('formatHour', () => {
  it('labels the first hour as now', () => {
    expect(formatHour('2026-10-22T16:00', 0)).toBe('Now');
    expect(formatHour('2026-10-22T16:00', 0, { nowLabel: 'Сейчас' })).toBe('Сейчас');
  });

  it('shows the local clock time in the locale format, without a timezone shift', () => {
    expect(formatHour('2026-10-22T17:00', 1, { locale: 'en-GB' })).toBe('17:00');
    expect(formatHour('2026-10-23T00:00', 8, { locale: 'en-GB' })).toBe('00:00');
    expect(formatHour('2026-10-22T17:00', 1, { locale: 'en-US' })).toMatch(/^5:00\sPM$/);
  });
});

describe('formatDay', () => {
  it('labels today and yesterday relative to the given date', () => {
    expect(formatDay('2026-10-19', '2026-10-19')).toBe('Today');
    expect(formatDay('2026-10-18', '2026-10-19')).toBe('Yesterday');
    expect(formatDay('2026-10-19', '2026-10-19', { todayLabel: 'Сегодня' })).toBe('Сегодня');
  });

  it('finds yesterday across month and year boundaries', () => {
    expect(formatDay('2026-10-31', '2026-11-01')).toBe('Yesterday');
    expect(formatDay('2025-12-31', '2026-01-01')).toBe('Yesterday');
  });

  it('formats other days in the given locale', () => {
    expect(formatDay('2026-10-20', '2026-10-19', { locale: 'en-GB' })).toBe('Tue');
    expect(formatDay('2026-10-24', '2026-10-19', { locale: 'ru' })).toBe('Сб');
  });
});
