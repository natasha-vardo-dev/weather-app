import { describe, expect, it } from 'vitest';
import {
  compareWithYesterday,
  describeWeather,
  formatDay,
  formatHour,
  rangePosition,
} from '../src/weather.js';

describe('describeWeather', () => {
  it('maps WMO codes to readable labels', () => {
    expect(describeWeather(0)).toEqual({ label: 'Clear sky', icon: 'clear' });
    expect(describeWeather(2).icon).toBe('partly-cloudy');
    expect(describeWeather(53).icon).toBe('drizzle');
    expect(describeWeather(81).icon).toBe('rain');
    expect(describeWeather(86).icon).toBe('snow');
    expect(describeWeather(95).label).toBe('Thunderstorm');
  });

  it('falls back for unknown codes', () => {
    expect(describeWeather(10).label).toBe('Unknown');
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
  it('labels the first hour as now and shows local clock time for the rest', () => {
    expect(formatHour('2026-10-22T16:00', 0)).toBe('Now');
    expect(formatHour('2026-10-22T17:00', 1)).toBe('17:00');
    expect(formatHour('2026-10-23T00:00', 8, 'Сейчас')).toBe('00:00');
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
  });
});
