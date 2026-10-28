import { describe, expect, it } from 'vitest';
import { compareAlerts, isAlertActive, type WeatherAlert } from '../src/alerts.js';

function alert(level: WeatherAlert['level'], onset: string, expires = '2026-10-28T12:00:00Z'): WeatherAlert {
  return { id: `${level}-${onset}`, level, type: 'wind', onset, expires, language: 'en', event: 'Wind' };
}

describe('compareAlerts', () => {
  it('puts the most severe first, then the soonest', () => {
    const sorted = [
      alert('yellow', '2026-10-27T10:00:00Z'),
      alert('orange', '2026-10-27T18:00:00Z'),
      alert('orange', '2026-10-27T12:00:00Z'),
      alert('red', '2026-10-28T00:00:00Z'),
    ].sort(compareAlerts);
    expect(sorted.map((a) => a.id)).toEqual([
      'red-2026-10-28T00:00:00Z',
      'orange-2026-10-27T12:00:00Z',
      'orange-2026-10-27T18:00:00Z',
      'yellow-2026-10-27T10:00:00Z',
    ]);
  });
});

describe('isAlertActive', () => {
  it('is true from onset until expiry', () => {
    const a = alert('yellow', '2026-10-27T10:00:00Z', '2026-10-27T20:00:00Z');
    expect(isAlertActive(a, Date.parse('2026-10-27T09:59:00Z'))).toBe(false);
    expect(isAlertActive(a, Date.parse('2026-10-27T10:00:00Z'))).toBe(true);
    expect(isAlertActive(a, Date.parse('2026-10-27T20:00:00Z'))).toBe(false);
  });
});

describe('matchesAlertSettings', () => {
  it('takes the level as a minimum and storms as wind and thunderstorms', async () => {
    const { matchesAlertSettings } = await import('../src/push.js');
    expect(matchesAlertSettings('red', 'wind', { group: 'storm', level: 'orange' })).toBe(true);
    expect(matchesAlertSettings('yellow', 'wind', { group: 'storm', level: 'orange' })).toBe(false);
    expect(matchesAlertSettings('orange', 'fog', { group: 'storm', level: 'orange' })).toBe(false);
    expect(matchesAlertSettings('orange', 'fog', { group: 'all', level: 'yellow' })).toBe(true);
  });
});
