import { describe, expect, it } from 'vitest';
import { summarizeAirQuality, guidelineBar } from '../src/airQuality.js';

const base = {
  time: '2026-10-24T19:00',
  europeanAqi: 54,
  usAqi: 68,
  pollutants: { pm2_5: 39, pm10: 61, ozone: 23, nitrogenDioxide: 31 },
};

describe('summarizeAirQuality', () => {
  it('uses the European index for places in Europe', () => {
    expect(summarizeAirQuality({ ...base, timezone: 'Europe/Warsaw' })).toEqual({
      scale: 'european',
      value: 54,
      level: 'moderate',
    });
  });

  it.each([
    'Atlantic/Canary',
    'Atlantic/Madeira',
    'Atlantic/Azores',
    'Atlantic/Reykjavik',
    'Atlantic/Faroe',
    'Asia/Nicosia',
    'Asia/Famagusta',
  ])('also uses the European index for %s', (timezone) => {
    expect(summarizeAirQuality({ ...base, timezone })?.scale).toBe('european');
  });

  it('uses the US index elsewhere', () => {
    expect(summarizeAirQuality({ ...base, timezone: 'America/New_York' })).toEqual({
      scale: 'us',
      value: 68,
      level: 'moderate',
    });
  });

  it('maps band edges to levels', () => {
    const eu = (v: number) => summarizeAirQuality({ ...base, europeanAqi: v, timezone: 'Europe/Paris' })?.level;
    expect([eu(20), eu(21), eu(40), eu(60), eu(80), eu(100), eu(101)]).toEqual([
      'good', 'fair', 'fair', 'moderate', 'poor', 'very-poor', 'extremely-poor',
    ]);
    const us = (v: number) => summarizeAirQuality({ ...base, usAqi: v, timezone: 'Asia/Tokyo' })?.level;
    expect([us(50), us(51), us(150), us(200), us(300), us(301)]).toEqual([
      'good', 'moderate', 'unhealthy-sensitive', 'unhealthy', 'very-unhealthy', 'hazardous',
    ]);
  });

  it('falls back to the other index, and to null without data', () => {
    expect(summarizeAirQuality({ ...base, europeanAqi: null, timezone: 'Europe/Berlin' })?.scale).toBe('us');
    expect(
      summarizeAirQuality({ ...base, europeanAqi: null, usAqi: null, timezone: 'Europe/Berlin' }),
    ).toBeNull();
  });
});

describe('guidelineBar', () => {
  it('puts the guideline in the middle while the value is below twice it', () => {
    expect(guidelineBar(13.9, 15)).toEqual({ value: 13.9 / 30, guideline: 0.5 });
    expect(guidelineBar(0, 25)).toEqual({ value: 0, guideline: 0.5 });
  });

  it('stretches the bar for a value far above the guideline', () => {
    expect(guidelineBar(90, 15)).toEqual({ value: 1, guideline: 15 / 90 });
  });
});
