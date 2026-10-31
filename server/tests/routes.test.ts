import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { ProviderError } from '../src/errors.js';
import { WeatherService } from '../src/services/weatherService.js';
import { createFakeProvider, sampleAirQuality, sampleForecast } from './fakeProvider.js';

function setup() {
  const provider = createFakeProvider();
  const app = createApp(new WeatherService(provider));
  return { app, provider };
}

describe('API versions', () => {
  it('serves the contract only under its version', async () => {
    const { app, provider } = setup();
    const res = await request(app).get('/api/forecast?lat=52.23&lon=21.01');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(provider.getForecast).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/forecast', () => {
  it('returns a forecast for valid coordinates', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/v1/forecast?lat=52.23&lon=21.01');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(sampleForecast);
  });

  it('rejects out-of-range coordinates', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/v1/forecast?lat=200&lon=21');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('lets browsers keep a stale forecast for a minute only', async () => {
    const provider = createFakeProvider();
    // A 1 ms TTL: the second answer is past it, returned at once while the forecast refreshes.
    const app = createApp(new WeatherService(provider, 1));
    const fresh = await request(app).get('/api/v1/forecast?lat=52.23&lon=21.01');
    // Warsaw's refresh never finishes, so it stays stale however fast the requests are.
    provider.getForecast.mockImplementation((lat) =>
      lat === 52.23 ? new Promise(() => {}) : Promise.resolve(sampleForecast),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    const stale = await request(app).get('/api/v1/forecast?lat=52.23&lon=21.01');
    const batch = await request(app).get('/api/v1/forecasts?places=52.23,21.01;50.06,19.94');

    expect(fresh.headers['cache-control']).toBe('public, max-age=300');
    expect(stale.headers['cache-control']).toBe('public, max-age=60');
    expect(stale.body).toEqual(sampleForecast);
    expect(batch.headers['cache-control']).toBe('public, max-age=60');
  });

  it('lets browsers keep stale air quality for a minute only', async () => {
    // Only Date is faked: the HTTP machinery keeps its real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { app } = setup();
      const fresh = await request(app).get('/api/v1/air-quality?lat=52.23&lon=21.01');
      // Past the TTL (an hour, up to 10% less at random: 54–60 minutes) and within the
      // 10 minutes after it, whichever TTL came up: 65 failed when it came up under 55.
      vi.setSystemTime(Date.now() + 62 * 60 * 1000);
      const stale = await request(app).get('/api/v1/air-quality?lat=52.23&lon=21.01');
      expect(fresh.headers['cache-control']).toBe('public, max-age=900');
      expect(stale.headers['cache-control']).toBe('public, max-age=60');
      expect(stale.body).toEqual(sampleAirQuality);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns 502 when the provider fails', async () => {
    const { app, provider } = setup();
    provider.getForecast.mockRejectedValueOnce(new ProviderError());
    const res = await request(app).get('/api/v1/forecast?lat=1&lon=1');
    expect(res.status).toBe(502);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('does not let browsers cache a failed air quality response', async () => {
    const { app, provider } = setup();
    provider.getAirQuality.mockRejectedValueOnce(new ProviderError());
    const res = await request(app).get('/api/v1/air-quality?lat=1&lon=1');
    expect(res.status).toBe(502);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('GET /api/v1/air-quality', () => {
  it('returns air quality for valid coordinates', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/v1/air-quality?lat=52.23&lon=21.01');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(sampleAirQuality);
  });

  it('rejects invalid coordinates', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/v1/air-quality?lat=abc&lon=21');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/locations/:id', () => {
  it('returns the place with names in the requested language', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/v1/locations/756135?lang=ru');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 756135, name: 'Варшава', country: 'Польша' });
  });

  it('answers 404 for an unknown id and 400 for a malformed one', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/v1/locations/1')).status).toBe(404);
    expect((await request(app).get('/api/v1/locations/abc')).status).toBe(400);
  });

  it('answers 400 for an id too large for the provider, without asking it', async () => {
    const { app, provider } = setup();
    expect((await request(app).get('/api/v1/locations/99999999999')).status).toBe(400);
    expect(provider.getLocation).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/locations', () => {
  it('requires at least 2 characters', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/v1/locations?q=a');
    expect(res.status).toBe(400);
  });

  it('returns matching locations', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/v1/locations?q=war');
    expect(res.status).toBe(200);
    expect(res.body.locations[0].name).toBe('Warsaw');
  });

  it('passes the language to the provider', async () => {
    const { app, provider } = setup();
    await request(app).get('/api/v1/locations?q=war&lang=pl');
    expect(provider.searchLocations).toHaveBeenCalledWith('war', 5, 'pl');
  });
});

describe('GET /api/v1/forecasts', () => {
  it('returns the forecasts in the order asked, each through the shared cache', async () => {
    const { app, provider } = setup();
    // The second place rounds to the first (~1 km): one provider call for both.
    const res = await request(app).get('/api/v1/forecasts?places=52.23,21.01;50.06,19.94;52.2301,21.0099');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect(res.body.forecasts).toHaveLength(3);
    expect(res.body.forecasts[0]).toEqual({ forecast: sampleForecast });
    expect(provider.getForecast).toHaveBeenCalledTimes(2);
    expect(provider.getForecast.mock.calls.map(([lat, lon]) => [lat, lon])).toEqual([
      [52.23, 21.01],
      [50.06, 19.94],
    ]);
  });

  it('answers the places that worked when one fails, and is not cached', async () => {
    const { app, provider } = setup();
    provider.getForecast.mockImplementation(async (lat: number) => {
      if (lat === 50.06) throw new ProviderError('timeout');
      return sampleForecast;
    });
    const res = await request(app).get('/api/v1/forecasts?places=52.23,21.01;50.06,19.94');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.forecasts[0]).toEqual({ forecast: sampleForecast });
    expect(res.body.forecasts[1]).toEqual({ error: { code: 'PROVIDER_ERROR', message: expect.any(String) } });
  });

  it('is an error when every place fails', async () => {
    const { app, provider } = setup();
    provider.getForecast.mockRejectedValue(new ProviderError());
    const res = await request(app).get('/api/v1/forecasts?places=52.23,21.01;50.06,19.94');
    expect(res.status).toBe(502);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('rejects more than ten places and malformed ones', async () => {
    const { app } = setup();
    const eleven = Array.from({ length: 11 }, (_, i) => `${i},${i}`).join(';');
    expect((await request(app).get(`/api/v1/forecasts?places=${eleven}`)).status).toBe(400);
    expect((await request(app).get('/api/v1/forecasts?places=52.23')).status).toBe(400);
    expect((await request(app).get('/api/v1/forecasts?places=200,1')).status).toBe(400);
    expect((await request(app).get('/api/v1/forecasts')).status).toBe(400);
  });
});
