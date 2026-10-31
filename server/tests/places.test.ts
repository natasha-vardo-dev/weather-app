import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { ProviderError } from '../src/errors.js';
import { NominatimGeocoder } from '../src/providers/nominatim.js';
import type { ReverseGeocoder } from '../src/providers/types.js';
import { distanceKm } from '@weather/shared';
import { PlaceService, type CitySearch } from '../src/services/placeService.js';
import { WeatherService } from '../src/services/weatherService.js';
import { createFakeProvider } from './fakeProvider.js';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Shapes taken from real Nominatim answers.
const warsawRu = {
  name: 'Варшава',
  address: { city: 'Варшава', state: 'Мазовецкое воеводство', country: 'Польша', country_code: 'pl' },
};
const moskenes = { name: 'Moskenes', address: { municipality: 'Moskenes', county: 'Nordland', country: 'Norway' } };

function geocoder(
  fetchFn: ReturnType<typeof vi.fn>,
  extra: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
) {
  return new NominatimGeocoder({
    userAgent: 'weather-app-test/1.0',
    fetchFn: fetchFn as unknown as typeof fetch,
    sleep: extra.sleep ?? (async () => {}),
    now: extra.now,
  });
}

describe('NominatimGeocoder', () => {
  it('asks at city level in the language, identifying the app', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(warsawRu));
    expect(await geocoder(fetchFn).reverse(52.23, 21.01, 'ru')).toEqual({ name: 'Варшава', country: 'Польша' });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get('accept-language')).toBe('ru');
    expect(url.searchParams.get('zoom')).toBe('10');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('weather-app-test/1.0');
  });

  it('falls back from city to smaller and larger units', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(moskenes));
    expect(await geocoder(fetchFn).reverse(67.93, 13.09, 'en')).toEqual({ name: 'Moskenes', country: 'Norway' });
  });

  it('answers null where there is no place (the sea)', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ error: 'Unable to geocode' }));
    expect(await geocoder(fetchFn).reverse(40, -30, 'en')).toBeNull();
  });

  it('turns failed responses into provider errors with the reason', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ error: 'Too many requests' }, 429));
    const err = await geocoder(fetchFn)
      .reverse(52.23, 21.01, 'en')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).detail).toMatch(/HTTP 429/);
  });

  it('spaces requests at least a second apart (usage policy)', async () => {
    let time = 0;
    const waits: number[] = [];
    const fetchFn = vi.fn(async () => jsonResponse(warsawRu));
    const g = geocoder(fetchFn, {
      now: () => time,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    await Promise.all([g.reverse(1, 1, 'en'), g.reverse(2, 2, 'en'), g.reverse(3, 3, 'en')]);
    expect(waits).toEqual([1100, 2200]);
    time = 10_000;
    await g.reverse(4, 4, 'en');
    expect(waits).toHaveLength(2);
  });
});

const warsaw = { id: 756135, name: 'Warsaw', country: 'Poland', latitude: 52.22977, longitude: 21.01178 };
// Another Warsaw, in Indiana: same name, far away.
const warsawIndiana = {
  id: 4927854,
  name: 'Warsaw',
  country: 'United States',
  latitude: 41.2381,
  longitude: -85.85305,
};

function cities(results = [warsawIndiana, warsaw]) {
  return { searchLocations: vi.fn<CitySearch['searchLocations']>(async () => results) };
}

describe('NominatimGeocoder queue', () => {
  it('refuses at once instead of queueing beyond maxQueueMs (a burst must not delay everyone)', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(warsawRu));
    const g = new NominatimGeocoder({
      userAgent: 'test',
      fetchFn: fetchFn as unknown as typeof fetch,
      now: () => 0,
      sleep: async () => {},
      minIntervalMs: 1100,
      maxQueueMs: 3000,
    });
    // Slots at 0, 1.1, 2.2 s are within 3 s; the fourth would wait 3.3 s.
    const results = await Promise.allSettled([1, 2, 3, 4].map((n) => g.reverse(n, n, 'en')));
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled', 'rejected']);
    expect((results[3] as PromiseRejectedResult).reason).toBeInstanceOf(ProviderError);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});

describe('distanceKm', () => {
  it('measures great-circle distance', () => {
    expect(distanceKm({ latitude: 52.23, longitude: 21.01 }, { latitude: 50.06, longitude: 19.94 })).toBeCloseTo(
      252,
      -1,
    );
  });
});

describe('PlaceService', () => {
  it('matches the position to the searched city: its coordinates and id (no duplicate in favourites)', async () => {
    // The user is ~4 km from the centre: a different 1 km cell than Warsaw from search.
    const places = new PlaceService({ reverse: async () => ({ name: 'Warsaw', country: 'Poland' }) }, cities());
    expect((await places.reverse(52.25, 21.05, 'en')).place).toEqual({
      id: 756135,
      name: 'Warsaw',
      country: 'Poland',
      latitude: 52.23,
      longitude: 21.01,
    });
  });

  it('keeps the position when no city of that name is near enough', async () => {
    const search = cities([warsawIndiana]);
    const places = new PlaceService({ reverse: async () => ({ name: 'Warsaw', country: 'Poland' }) }, search);
    expect(await places.reverse(52.25, 21.05, 'pl')).toEqual({
      place: { name: 'Warsaw', country: 'Poland', latitude: 52.25, longitude: 21.05 },
      // A real answer ("no city near enough"): cached.
      cacheable: true,
    });
    expect(search.searchLocations).toHaveBeenCalledWith('Warsaw', 10, 'pl');
  });

  it('answers with the position when city search fails, but does not cache that fallback', async () => {
    const search = {
      searchLocations: vi.fn<CitySearch['searchLocations']>(async () => Promise.reject(new Error('down'))),
    };
    const reverse = vi.fn<ReverseGeocoder['reverse']>(async () => ({ name: 'Warsaw', country: 'Poland' }));
    const places = new PlaceService({ reverse }, search);
    expect(await places.reverse(52.25, 21.05, 'en')).toEqual({
      place: { name: 'Warsaw', country: 'Poland', latitude: 52.25, longitude: 21.05 },
      cacheable: false,
    });
    // Search is back: the next request matches the city instead of reusing the fallback.
    search.searchLocations.mockResolvedValue([warsaw]);
    expect((await places.reverse(52.25, 21.05, 'en')).place).toMatchObject({ id: 756135, latitude: 52.23 });
    expect(reverse).toHaveBeenCalledTimes(2);
  });

  it('caches by rounded coordinates and language, "no place" included', async () => {
    const reverse = vi.fn<ReverseGeocoder['reverse']>(async (lat) => (lat > 0 ? { name: 'Warsaw' } : null));
    const places = new PlaceService({ reverse }, cities());
    await places.reverse(52.2297, 21.0118, 'en');
    await places.reverse(52.231, 21.009, 'en');
    expect(reverse).toHaveBeenCalledTimes(1);
    expect(reverse).toHaveBeenCalledWith(52.23, 21.01, 'en');
    await places.reverse(52.23, 21.01, 'ru');
    expect(reverse).toHaveBeenCalledTimes(2);
    await places.reverse(-40, -30, 'en');
    await places.reverse(-40, -30, 'en');
    expect(reverse).toHaveBeenCalledTimes(3);
  });
});

describe('GET /api/v1/places/reverse', () => {
  function setup(reverse: ReverseGeocoder['reverse']) {
    const service = new WeatherService(createFakeProvider());
    return createApp(service, { places: new PlaceService({ reverse }, service) });
  }

  it('returns the matched city with a long cache lifetime', async () => {
    const app = setup(async () => ({ name: 'Warsaw', country: 'Poland' }));
    const res = await request(app).get('/api/v1/places/reverse?lat=52.25&lon=21.05&lang=en');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1, name: 'Warsaw', country: 'Poland', latitude: 52.23, longitude: 21.01 });
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
  });
  it('answers 404 where there is no place and 400 for bad coordinates', async () => {
    const app = setup(async () => null);
    expect((await request(app).get('/api/v1/places/reverse?lat=40&lon=-30')).status).toBe(404);
    expect((await request(app).get('/api/v1/places/reverse?lat=200&lon=0')).status).toBe(400);
  });

  it('sends the search-failed fallback with no-store, so browsers do not keep it', async () => {
    const service = new WeatherService(createFakeProvider());
    const failingSearch = { searchLocations: async () => Promise.reject(new Error('down')) };
    const app = createApp(service, {
      places: new PlaceService({ reverse: async () => ({ name: 'Warsaw' }) }, failingSearch),
    });
    const res = await request(app).get('/api/v1/places/reverse?lat=52.25&lon=21.05');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'Warsaw', latitude: 52.25, longitude: 21.05 });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('answers 502 without caching when the geocoder fails', async () => {
    const app = setup(async () => {
      throw new ProviderError('down');
    });
    const res = await request(app).get('/api/v1/places/reverse?lat=52.23&lon=21.01');
    expect(res.status).toBe(502);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
