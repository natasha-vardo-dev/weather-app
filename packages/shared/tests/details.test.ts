import { describe, expect, it } from 'vitest';
import {
  dewPointComfort,
  nextHour,
  sunEventsAfter,
  nextSunEvents,
  pressureTrend,
  uvLevel,
  uvProtectionWindow,
  visibilityLevel,
} from '../src/details.js';

describe('uvLevel', () => {
  it('follows the WHO bands, by the rounded value', () => {
    expect([0, 2.4, 2.5, 5, 6, 7.4, 8, 10, 11, 14].map(uvLevel)).toEqual([
      'low',
      'low',
      'moderate',
      'moderate',
      'high',
      'high',
      'very-high',
      'very-high',
      'extreme',
      'extreme',
    ]);
  });
});

describe('uvProtectionWindow', () => {
  const hours = (values: number[]) =>
    values.map((uvIndex, i) => ({ time: `2026-07-01T${String(9 + i).padStart(2, '0')}:00`, uvIndex }));

  it('runs from the first hour at 3 or above to the end of that run', () => {
    expect(uvProtectionWindow(hours([1, 2.6, 5, 6, 3, 2, 4]))).toEqual({
      from: '2026-07-01T10:00',
      until: '2026-07-01T14:00',
    });
  });

  it('is null when the UV never gets there, or is unknown', () => {
    expect(uvProtectionWindow(hours([0, 1, 2.4]))).toBeNull();
    expect(uvProtectionWindow([{ time: '2026-07-01T12:00', uvIndex: null }])).toBeNull();
  });

  it('ends at midnight correctly when the run ends at 23:00', () => {
    const hours = [
      { time: '2026-07-01T23:00', uvIndex: 3 },
      { time: '2026-07-02T00:00', uvIndex: 0 },
    ];
    expect(uvProtectionWindow(hours)?.until).toBe('2026-07-02T00:00');
  });

  it('has no end when the run reaches the last hour given (it goes on past the data)', () => {
    expect(uvProtectionWindow(hours([1, 2, 4, 6]))).toEqual({ from: '2026-07-01T11:00', until: null });
  });
});

describe('pressureTrend', () => {
  const at = (...values: (number | null)[]) => values.map((pressure) => ({ pressure }));
  it('compares now with three hours ahead', () => {
    expect(pressureTrend(at(1010, 1010, 1011, 1011.4))).toBe('rising');
    expect(pressureTrend(at(1010, 1009, 1009, 1008))).toBe('falling');
    expect(pressureTrend(at(1010, 1011, 1009, 1010.5))).toBe('steady');
  });
  it('is null without data', () => {
    expect(pressureTrend(at(1010, 1010))).toBeNull();
    expect(pressureTrend(at(null, 1, 1, 1))).toBeNull();
  });
});

describe('visibilityLevel and dewPointComfort', () => {
  it('bands visibility in metres', () => {
    expect([500, 1000, 3999, 9999, 24000].map(visibilityLevel)).toEqual(['fog', 'poor', 'poor', 'moderate', 'good']);
  });
  it('bands the dew point', () => {
    expect([-3, 9.9, 10, 15.9, 16, 20.9, 21].map(dewPointComfort)).toEqual([
      'fresh',
      'fresh',
      'comfortable',
      'comfortable',
      'humid',
      'humid',
      'muggy',
    ]);
  });
});

describe('nextSunEvents', () => {
  const days = [
    { sunrise: '2026-10-28T06:42', sunset: '2026-10-28T16:21' },
    { sunrise: '2026-10-29T06:44', sunset: '2026-10-29T16:19' },
  ];
  it('leads with whatever comes next, then the one after', () => {
    expect(nextSunEvents('2026-10-28T05:00', days)).toEqual([
      { event: 'sunrise', time: '2026-10-28T06:42' },
      { event: 'sunset', time: '2026-10-28T16:21' },
    ]);
    expect(nextSunEvents('2026-10-28T17:30', days)).toEqual([
      { event: 'sunrise', time: '2026-10-29T06:44' },
      { event: 'sunset', time: '2026-10-29T16:19' },
    ]);
  });
  it('skips days without one (polar night), and is null when none is known', () => {
    expect(
      nextSunEvents('2026-12-21T10:00', [
        { sunrise: null, sunset: null },
        { sunrise: '2026-12-22T11:50', sunset: null },
      ]),
    ).toEqual([{ event: 'sunrise', time: '2026-12-22T11:50' }, null]);
    expect(nextSunEvents('2026-10-28T05:00', [{}])).toBeNull();
  });
});

describe('nextHour', () => {
  it('adds an hour in local time, across midnight and month ends', () => {
    expect(nextHour('2026-10-29T14:00')).toBe('2026-10-29T15:00');
    expect(nextHour('2026-10-31T23:00')).toBe('2026-11-01T00:00');
  });
});

describe('sunEventsAfter', () => {
  // 24 hours from 14:00 on the 29th to 13:00 on the 30th, local times as the provider gives them.
  const hours = Array.from({ length: 24 }, (_, i) => ({
    time: new Date(Date.UTC(2026, 9, 29, 14 + i)).toISOString().slice(0, 16),
  }));
  const days = [
    { sunrise: '2026-10-29T06:40', sunset: '2026-10-29T14:21' },
    { sunrise: '2026-10-30T06:42', sunset: '2026-10-30T16:19' },
  ];

  it('puts each event after the hour it falls in', () => {
    const events = sunEventsAfter(hours, days, '2026-10-29T14:10');
    expect(events.get(0)).toEqual([{ event: 'sunset', time: '2026-10-29T14:21' }]);
    expect(events.get(16)).toEqual([{ event: 'sunrise', time: '2026-10-30T06:42' }]);
  });

  it('skips an event in the first hour that has already happened', () => {
    expect(sunEventsAfter(hours, days, '2026-10-29T14:40').get(0)).toBeUndefined();
  });

  it('shows an event in the last hour', () => {
    // Hours run 14:00 today to 13:00 tomorrow; a sunset at 13:30 tomorrow is in the last one.
    const late = [{ sunset: '2026-10-30T13:30' }];
    expect(sunEventsAfter(hours, late, '2026-10-29T14:00').get(23)).toEqual([
      { event: 'sunset', time: '2026-10-30T13:30' },
    ]);
  });

  it('skips days without a sunrise or sunset (polar day or night)', () => {
    expect(sunEventsAfter(hours, [{ sunrise: null, sunset: null }]).size).toBe(0);
  });
});
