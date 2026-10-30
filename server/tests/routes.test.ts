import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ProviderError } from '../src/errors.js';
import { WeatherService } from '../src/services/weatherService.js';
import { createFakeProvider, sampleAirQuality, sampleForecast } from './fakeProvider.js';

function setup() {
  const provider = createFakeProvider();
  const app = createApp(new WeatherService(provider));
  return { app, provider };
}

describe('GET /api/forecast', () => {
  it('returns a forecast for valid coordinates', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/forecast?lat=52.23&lon=21.01');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(sampleForecast);
  });

  it('rejects out-of-range coordinates', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/forecast?lat=200&lon=21');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 502 when the provider fails', async () => {
    const { app, provider } = setup();
    provider.getForecast.mockRejectedValueOnce(new ProviderError());
    const res = await request(app).get('/api/forecast?lat=1&lon=1');
    expect(res.status).toBe(502);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('does not let browsers cache a failed air quality response', async () => {
    const { app, provider } = setup();
    provider.getAirQuality.mockRejectedValueOnce(new ProviderError());
    const res = await request(app).get('/api/air-quality?lat=1&lon=1');
    expect(res.status).toBe(502);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('GET /api/air-quality', () => {
  it('returns air quality for valid coordinates', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/air-quality?lat=52.23&lon=21.01');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(sampleAirQuality);
  });

  it('rejects invalid coordinates', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/air-quality?lat=abc&lon=21');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/locations/:id', () => {
  it('returns the place with names in the requested language', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/locations/756135?lang=ru');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 756135, name: 'Варшава', country: 'Польша' });
  });

  it('answers 404 for an unknown id and 400 for a malformed one', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/locations/1')).status).toBe(404);
    expect((await request(app).get('/api/locations/abc')).status).toBe(400);
  });

  it('answers 400 for an id too large for the provider, without asking it', async () => {
    const { app, provider } = setup();
    expect((await request(app).get('/api/locations/99999999999')).status).toBe(400);
    expect(provider.getLocation).not.toHaveBeenCalled();
  });
});

describe('GET /api/locations', () => {
  it('requires at least 2 characters', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/locations?q=a');
    expect(res.status).toBe(400);
  });

  it('returns matching locations', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/locations?q=war');
    expect(res.status).toBe(200);
    expect(res.body.locations[0].name).toBe('Warsaw');
  });

  it('passes the language to the provider', async () => {
    const { app, provider } = setup();
    await request(app).get('/api/locations?q=war&lang=pl');
    expect(provider.searchLocations).toHaveBeenCalledWith('war', 5, 'pl');
  });
});

describe('GET /api/forecasts', () => {
  it('returns the forecasts in the order asked, each through the shared cache', async () => {
    const { app, provider } = setup();
    // The second place rounds to the first (~1 km): one provider call for both.
    const res = await request(app).get('/api/forecasts?places=52.23,21.01;50.06,19.94;52.2301,21.0099');
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
    const res = await request(app).get('/api/forecasts?places=52.23,21.01;50.06,19.94');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.forecasts[0]).toEqual({ forecast: sampleForecast });
    expect(res.body.forecasts[1]).toEqual({ error: { code: 'PROVIDER_ERROR', message: expect.any(String) } });
  });

  it('is an error when every place fails', async () => {
    const { app, provider } = setup();
    provider.getForecast.mockRejectedValue(new ProviderError());
    const res = await request(app).get('/api/forecasts?places=52.23,21.01;50.06,19.94');
    expect(res.status).toBe(502);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('rejects more than ten places and malformed ones', async () => {
    const { app } = setup();
    const eleven = Array.from({ length: 11 }, (_, i) => `${i},${i}`).join(';');
    expect((await request(app).get(`/api/forecasts?places=${eleven}`)).status).toBe(400);
    expect((await request(app).get('/api/forecasts?places=52.23')).status).toBe(400);
    expect((await request(app).get('/api/forecasts?places=200,1')).status).toBe(400);
    expect((await request(app).get('/api/forecasts')).status).toBe(400);
  });
});
