import { describe, expect, it } from 'vitest';
import { formatAlertTime } from '../src/alertTime';

// 27 Oct 2026, 12:00 UTC: 13:00 in Warsaw.
const now = Date.parse('2026-10-27T12:00:00Z');

describe('formatAlertTime', () => {
  it('says today and tomorrow in the place time zone', () => {
    expect(formatAlertTime('2026-10-27T20:00:00+01:00', { locale: 'en-GB', timeZone: 'Europe/Warsaw', now })).toBe(
      'today 20:00',
    );
    expect(formatAlertTime('2026-10-28T10:00:00+01:00', { locale: 'en-GB', timeZone: 'Europe/Warsaw', now })).toBe(
      'tomorrow 10:00',
    );
  });

  it('uses the weekday further ahead, and the language of the interface', () => {
    expect(formatAlertTime('2026-10-29T06:00:00+01:00', { locale: 'en-GB', timeZone: 'Europe/Warsaw', now })).toBe(
      'Thu 06:00',
    );
    expect(formatAlertTime('2026-10-28T10:00:00+01:00', { locale: 'ru', timeZone: 'Europe/Warsaw', now })).toBe(
      'завтра 10:00',
    );
  });

  it('counts days at the place, not where the reader is', () => {
    // 23:30 UTC on the 27th is already the 28th in Warsaw.
    expect(formatAlertTime('2026-10-27T23:30:00Z', { locale: 'en-GB', timeZone: 'Europe/Warsaw', now })).toBe(
      'tomorrow 00:30',
    );
  });

  it('gives an empty string for an unreadable date instead of throwing', () => {
    expect(formatAlertTime('', { locale: 'en-GB', timeZone: 'Europe/Warsaw', now })).toBe('');
  });
});
