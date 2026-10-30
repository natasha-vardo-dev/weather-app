import { ApiError, ERROR_CODES, type Favorite, type Location } from '@weather/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api/client';
import { loadNames, withVerifiedId } from '../src/hooks/useLocalizedPlace';

vi.mock('../src/api/client', () => ({
  api: { getLocation: vi.fn(), searchLocations: vi.fn() },
}));

const getLocation = vi.mocked(api.getLocation);
const searchLocations = vi.mocked(api.searchLocations);

const warsaw: Location = { id: 756135, name: 'Варшава', country: 'Польша', latitude: 52.22977, longitude: 21.01178 };
const london: Location = {
  id: 2643743,
  name: 'Лондон',
  country: 'Великобритания',
  latitude: 51.50853,
  longitude: -0.12574,
};

// A place as it comes from a URL: rounded coordinates, names in the language it was found in.
const warsawLink: Favorite = { latitude: 52.23, longitude: 21.01, name: 'Warsaw', country: 'Poland', id: 756135 };

// The names cache lives for the whole module, so each test uses its own id or place;
// otherwise a result cached by an earlier test would answer instead of the mock.
beforeEach(() => {
  getLocation.mockReset();
  searchLocations.mockReset();
});

describe('loadNames', () => {
  it('uses the id lookup when the place is at the same coordinates', async () => {
    getLocation.mockResolvedValueOnce(warsaw);
    expect(await loadNames(warsawLink, 'ru')).toEqual({ name: 'Варшава', country: 'Польша' });
    expect(getLocation).toHaveBeenCalledWith(756135, { language: 'ru' });
  });

  it('rejects an id that belongs to another place', async () => {
    getLocation.mockResolvedValueOnce(london);
    expect(await loadNames({ ...warsawLink, id: london.id }, 'ru')).toBeNull();
  });

  it('searches by name without an id and keeps only a result at the same coordinates', async () => {
    searchLocations.mockResolvedValueOnce([{ ...warsaw, id: 1, latitude: 41.24, longitude: -85.85 }, warsaw]);
    const { id: _id, ...noId } = warsawLink;
    expect(await loadNames(noId, 'ru')).toEqual({ name: 'Варшава', country: 'Польша' });
    expect(searchLocations).toHaveBeenCalledWith('Warsaw', { language: 'ru' });
  });

  it('gives up when no search result is at the coordinates', async () => {
    searchLocations.mockResolvedValueOnce([london]);
    expect(await loadNames({ latitude: 52.23, longitude: 21.01, name: 'Warsaw' }, 'de')).toBeNull();
  });

  it('does not search for a name the search API would reject (too short or too long)', async () => {
    expect(await loadNames({ latitude: 67.93, longitude: 13.09, name: 'Å' }, 'ru')).toBeNull();
    expect(await loadNames({ latitude: 1, longitude: 1, name: 'x'.repeat(101) }, 'ru')).toBeNull();
    expect(searchLocations).not.toHaveBeenCalled();
  });

  it('does not search for a link without a name (coordinates as the name)', async () => {
    expect(await loadNames({ latitude: 52.23, longitude: 21.01, name: '52.23, 21.01' }, 'ru')).toBeNull();
    expect(searchLocations).not.toHaveBeenCalled();
  });
});

describe('loadNames: unknown ids', () => {
  it('answers null for an unknown id (404) instead of failing, so the answer is cached', async () => {
    getLocation.mockRejectedValueOnce(new ApiError('Location not found.', ERROR_CODES.NOT_FOUND, 404));
    expect(await loadNames({ ...warsawLink, id: 123 }, 'ru')).toBeNull();
  });

  it('still fails on other errors, so they are retried later', async () => {
    getLocation.mockRejectedValueOnce(new ApiError('Down', ERROR_CODES.PROVIDER_ERROR, 502));
    await expect(loadNames({ ...warsawLink, id: 124 }, 'ru')).rejects.toBeInstanceOf(ApiError);
  });

  it('asks only once for an unknown id', async () => {
    getLocation.mockRejectedValue(new ApiError('Location not found.', ERROR_CODES.NOT_FOUND, 404));
    const stale = { ...warsawLink, id: 125 };
    expect(await withVerifiedId(stale, 'cs')).not.toHaveProperty('id');
    expect(await withVerifiedId(stale, 'cs')).not.toHaveProperty('id');
    expect(getLocation).toHaveBeenCalledTimes(1);
  });
});

describe('withVerifiedId', () => {
  it('keeps an id that matches the place', async () => {
    getLocation.mockResolvedValueOnce(warsaw);
    expect(await withVerifiedId(warsawLink, 'en')).toEqual(warsawLink);
  });

  it('drops an id that belongs to another place', async () => {
    getLocation.mockResolvedValueOnce(london);
    const saved = await withVerifiedId({ ...warsawLink, id: london.id }, 'en');
    expect(saved).toEqual({ latitude: 52.23, longitude: 21.01, name: 'Warsaw', country: 'Poland' });
  });

  it('drops an id when the lookup fails (unknown id or network)', async () => {
    getLocation.mockRejectedValueOnce(new Error('404'));
    const saved = await withVerifiedId({ ...warsawLink, id: 999 }, 'en');
    expect(saved).not.toHaveProperty('id');
  });

  it('returns a place without an id as is, with no request', async () => {
    const place: Favorite = { latitude: 52.23, longitude: 21.01, name: 'Warsaw' };
    expect(await withVerifiedId(place, 'en')).toBe(place);
    expect(getLocation).not.toHaveBeenCalled();
    expect(searchLocations).not.toHaveBeenCalled();
  });

  it('does not reuse a check made for the real place at other coordinates', async () => {
    // The real Warsaw is checked and cached first, then an edited link pairs its id with Paris.
    getLocation.mockResolvedValue(warsaw);
    const real = { ...warsawLink, id: 756136 };
    expect(await withVerifiedId(real, 'pl')).toEqual(real);
    const paris = await withVerifiedId({ ...real, latitude: 48.85, longitude: 2.35, name: 'Paris' }, 'pl');
    expect(paris).not.toHaveProperty('id');
    // The lookup by id is shared (one request), but the check against the coordinates runs again.
    expect(getLocation).toHaveBeenCalledTimes(1);
  });
});
