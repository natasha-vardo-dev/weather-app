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
