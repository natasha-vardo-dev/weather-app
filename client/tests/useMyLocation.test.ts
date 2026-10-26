import { ApiError, ERROR_CODES } from '@weather/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api/client';
import { approximatePlace, preferSaved, reversePlace, toFoundPlace } from '../src/hooks/useMyLocation';

vi.mock('../src/api/client', () => ({ api: { reverseGeocode: vi.fn(), approximateLocation: vi.fn() } }));

const reverseGeocode = vi.mocked(api.reverseGeocode);

// The names cache lives for the whole module: each test uses its own coordinates.
beforeEach(() => {
  reverseGeocode.mockReset();
});

describe('reversePlace', () => {
  it('returns the place in the language and asks once per position and language', async () => {
    const warsaw = { id: 756135, name: 'Варшава', country: 'Польша', latitude: 52.23, longitude: 21.01 };
    reverseGeocode.mockResolvedValue(warsaw);
    const here = { latitude: 52.25, longitude: 21.05 };
    expect(await reversePlace(here, 'ru')).toEqual(warsaw);
    await reversePlace(here, 'ru');
    expect(reverseGeocode).toHaveBeenCalledTimes(1);
    expect(reverseGeocode).toHaveBeenCalledWith(52.25, 21.05, { language: 'ru' });
  });

  it('answers null where there is no place (404), and remembers it', async () => {
    reverseGeocode.mockRejectedValue(new ApiError('No place', ERROR_CODES.NOT_FOUND, 404));
    const sea = { latitude: 40, longitude: -30 };
    expect(await reversePlace(sea, 'en')).toBeNull();
    expect(await reversePlace(sea, 'en')).toBeNull();
    expect(reverseGeocode).toHaveBeenCalledTimes(1);
  });

  it('does not keep an answer without an id (maybe the no-store fallback after a failed city search)', async () => {
    reverseGeocode.mockResolvedValueOnce({ name: 'Warsaw', latitude: 52.26, longitude: 21.06 });
    const here = { latitude: 52.26, longitude: 21.06 };
    await reversePlace(here, 'en');
    reverseGeocode.mockResolvedValueOnce({ id: 756135, name: 'Warsaw', latitude: 52.23, longitude: 21.01 });
    expect(await reversePlace(here, 'en')).toMatchObject({ id: 756135 });
    expect(reverseGeocode).toHaveBeenCalledTimes(2);
  });

  it('fails on other errors, so they are retried next time', async () => {
    reverseGeocode.mockRejectedValueOnce(new ApiError('Down', ERROR_CODES.PROVIDER_ERROR, 502));
    await expect(reversePlace({ latitude: 1, longitude: 1 }, 'en')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('toFoundPlace', () => {
  const position = { latitude: 52.25, longitude: 21.05 };

  it('opens the matched city with its coordinates and id', () => {
    const warsaw = { id: 756135, name: 'Warsaw', country: 'Poland', latitude: 52.23, longitude: 21.01 };
    expect(toFoundPlace(warsaw, position)).toEqual(warsaw);
  });

  it('survives an answer without coordinates (HTTP-cached from an older server)', () => {
    const stale = { name: 'Warsaw', country: 'Poland' } as unknown as Parameters<typeof toFoundPlace>[0];
    expect(toFoundPlace(stale, position)).toEqual({ ...position, name: 'Warsaw', country: 'Poland' });
  });

  it('never pairs an id with the user\'s own coordinates', () => {
    const odd = { id: 756135, name: 'Warsaw', latitude: Number.NaN, longitude: 21.01 };
    expect(toFoundPlace(odd, position)).toEqual({ ...position, name: 'Warsaw' });
  });

  it('opens the position when there is no answer', () => {
    expect(toFoundPlace(null, position)).toEqual(position);
  });
});

describe('preferSaved', () => {
  const saved = { latitude: 52.23, longitude: 21.01, name: 'Warsaw', country: 'Poland', id: 756135 };

  it('opens the saved city instead of the position in it (no second Warsaw)', () => {
    expect(preferSaved({ latitude: 52.25, longitude: 21.05, name: 'Warsaw', country: 'Poland' }, [saved])).toBe(saved);
  });

  it('keeps the found place when nothing saved matches', () => {
    const minsk = { latitude: 53.9, longitude: 27.57, name: 'Minsk' };
    expect(preferSaved(minsk, [saved])).toBe(minsk);
    const nameless = { latitude: 52.25, longitude: 21.05 };
    expect(preferSaved(nameless, [saved])).toBe(nameless);
  });
});

describe('approximatePlace', () => {
  const approximateLocation = vi.mocked(api.approximateLocation);

  it('offers the city from the IP, with its id', async () => {
    approximateLocation.mockResolvedValueOnce({ id: 756135, name: 'Warsaw', country: 'Poland', latitude: 52.23, longitude: 21.01 });
    expect(await approximatePlace('en')).toEqual({ id: 756135, name: 'Warsaw', country: 'Poland', latitude: 52.23, longitude: 21.01 });
    expect(approximateLocation).toHaveBeenCalledWith({ language: 'en' });
  });

  it('offers nothing when the address can not be placed or the answer is broken', async () => {
    approximateLocation.mockRejectedValueOnce(new ApiError('No', ERROR_CODES.NOT_FOUND, 404));
    expect(await approximatePlace('en')).toBeNull();
    approximateLocation.mockResolvedValueOnce({ name: 'Warsaw' } as never);
    expect(await approximatePlace('en')).toBeNull();
  });
});
