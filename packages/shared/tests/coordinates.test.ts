import { describe, expect, it } from 'vitest';
import { placeKey, roundCoordinate } from '../src/coordinates.js';

describe('coordinate rounding', () => {
  it('rounds to ~1 km, so nearby points are one place', () => {
    expect(roundCoordinate(52.22977)).toBe(52.23);
    expect(roundCoordinate(-0.004)).toBe(-0);
    expect(placeKey({ latitude: 52.22977, longitude: 21.01178 })).toBe('52.23,21.01');
    expect(placeKey({ latitude: 52.231, longitude: 21.009 })).toBe(placeKey({ latitude: 52.2299, longitude: 21.0101 }));
  });

  it('keeps the trailing zero in the key, as place URLs do', () => {
    expect(placeKey({ latitude: 52.2, longitude: 21 })).toBe('52.20,21.00');
  });
});
