import { describe, expect, it } from 'vitest';
import {
  compareWithYesterday,
  describeWeather,
  forecastAgeMinutes,
  placeTimeToInstant,
  formatDay,
  formatHour,
  rangePosition,
} from '../src/weather.js';

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

describe('forecastAgeMinutes', () => {
  // 13:20 UTC is 14:20 in Warsaw (winter time, UTC+1) and 09:20 in New York (UTC-4 until November).
  const now = new Date('2026-10-30T13:20:00Z');

  it("counts from the data's local time to now at the place", () => {
    expect(forecastAgeMinutes('2026-10-30T14:15', 'Europe/Warsaw', now)).toBe(5);
    expect(forecastAgeMinutes('2026-10-30T13:00', 'Europe/Warsaw', now)).toBe(80);
    expect(forecastAgeMinutes('2026-10-30T08:15', 'America/New_York', now)).toBe(65);
  });

  it('works across midnight at the place', () => {
    expect(forecastAgeMinutes('2026-10-30T23:45', 'Asia/Tokyo', new Date('2026-10-30T15:30:00Z'))).toBe(45);
  });

  it('counts real minutes across daylight-saving changes', () => {
    // Spring, Warsaw: 02:00 becomes 03:00 on 29 March. Data from 01:45 (00:45 UTC), now 03:00 (01:00 UTC).
    expect(forecastAgeMinutes('2026-03-29T01:45', 'Europe/Warsaw', new Date('2026-03-29T01:00:00Z'))).toBe(15);
    // Autumn: 03:00 becomes 02:00 on 25 October. Data from 01:30 (23:30 UTC), now the second 02:30 (01:30 UTC).
    expect(forecastAgeMinutes('2026-10-25T01:30', 'Europe/Warsaw', new Date('2026-10-25T01:30:00Z'))).toBe(120);
  });

  it('is 0 for an unreadable time or time zone, and never negative', () => {
    expect(forecastAgeMinutes('not a time', 'Europe/Warsaw', now)).toBe(0);
    expect(forecastAgeMinutes('2026-10-30T14:15', 'Not/AZone', now)).toBe(0);
    expect(forecastAgeMinutes('2026-10-30T15:00', 'Europe/Warsaw', now)).toBe(0);
  });
});

describe('placeTimeToInstant', () => {
  it('turns a local time at a place into an instant, on both sides of a change', () => {
    expect(placeTimeToInstant('2026-10-30T14:15', 'Europe/Warsaw')).toBe(Date.parse('2026-10-30T13:15:00Z'));
    expect(placeTimeToInstant('2026-07-30T14:15', 'Europe/Warsaw')).toBe(Date.parse('2026-07-30T12:15:00Z'));
    expect(placeTimeToInstant('2026-10-30T14:15', 'Not/AZone')).toBeNull();
    expect(placeTimeToInstant('14:15', 'Europe/Warsaw')).toBeNull();
  });
});
