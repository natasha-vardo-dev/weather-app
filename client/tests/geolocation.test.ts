import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCurrentPosition,
  rememberedPosition,
  rememberPosition,
  roundCoordinates,
  toLocationError,
} from '../src/geolocation';

function fakeGeolocation(result: { coords: { latitude: number; longitude: number } } | { code: number }) {
  return {
    getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) => {
      if ('coords' in result) ok(result as GeolocationPosition);
      else fail(result as GeolocationPositionError);
    },
  } as unknown as Geolocation;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('roundCoordinates', () => {
  it('rounds to ~1 km, like the rest of the app', () => {
    expect(roundCoordinates({ latitude: 52.229676, longitude: 21.012229 })).toEqual({
      latitude: 52.23,
      longitude: 21.01,
    });
  });
});

describe('toLocationError', () => {
  it('maps the GeolocationPositionError codes', () => {
    expect(toLocationError({ code: 1 })).toBe('denied');
    expect(toLocationError({ code: 2 })).toBe('unavailable');
    expect(toLocationError({ code: 3 })).toBe('timeout');
    expect(toLocationError(null)).toBe('unavailable');
  });
});

describe('getCurrentPosition', () => {
  it('resolves with rounded coordinates', async () => {
    const geo = fakeGeolocation({ coords: { latitude: 52.2297, longitude: 21.0122 } });
    await expect(getCurrentPosition(geo)).resolves.toEqual({ latitude: 52.23, longitude: 21.01 });
  });

  it('rejects with the reason', async () => {
    await expect(getCurrentPosition(fakeGeolocation({ code: 1 }))).rejects.toBe('denied');
    await expect(getCurrentPosition(fakeGeolocation({ code: 3 }))).rejects.toBe('timeout');
  });

  it('rejects as unsupported without the API (old browser, http page)', async () => {
    await expect(getCurrentPosition(undefined)).rejects.toBe('unsupported');
  });
});

describe('remembered position', () => {
  it('marks the place opened as "my location" this session, and how it was found', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    });
    expect(rememberedPosition(52.23, 21.01)).toBeNull();
    rememberPosition({ latitude: 52.2297, longitude: 21.0122 });
    expect(rememberedPosition(52.23, 21.01)).toBe('exact');
    expect(rememberedPosition(41.9, 12.5)).toBeNull();
    rememberPosition({ latitude: 41.9, longitude: 12.5 }, 'approximate');
    expect(rememberedPosition(41.9, 12.5)).toBe('approximate');
  });
});
