import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { BusyError } from '../src/errors.js';
import { silentLogger } from '../src/observability/logger.js';
import { Metrics, openMeteoWeight } from '../src/observability/metrics.js';
import { OpenMeteoProvider } from '../src/providers/openMeteo.js';
import { ApproximateLocationService } from '../src/services/approximateService.js';
import { PlaceService } from '../src/services/placeService.js';
import { WeatherService } from '../src/services/weatherService.js';
import { createFakeProvider } from './fakeProvider.js';

describe('provider budget', () => {
  it('refuses new calls at 90% of a limit, logs once a minute, and counts them', () => {
    let now = 0;
    const warn = vi.fn();
    const logger = { ...silentLogger, warn } as unknown as typeof silentLogger;
    const metrics = new Metrics(logger, () => now);
    const record = metrics.provider('open-meteo', { perMinute: 10, perDay: 1000 });
    const budget = metrics.budget('open-meteo');

    for (let i = 0; i < 8; i += 1) record(true);
    expect(() => budget()).not.toThrow();
    record(true);
    expect(() => budget()).toThrow(BusyError);
    expect(() => budget()).toThrow(BusyError);
    const refusals = warn.mock.calls.filter(([, message]) => message === 'provider budget reached, refusing new calls');
    expect(refusals).toHaveLength(1);
    expect(metrics.snapshot().providers['open-meteo']!.refused).toBe(2);

    // The minute window moves on: calls go out again.
    now = 2 * 60_000;
    expect(() => budget()).not.toThrow();
  });

  it('never refuses a provider without limits, or one never registered', () => {
    const metrics = new Metrics(silentLogger);
    const record = metrics.provider('nominatim');
    for (let i = 0; i < 100; i += 1) record(true);
    expect(() => metrics.budget('nominatim')()).not.toThrow();
    expect(() => metrics.budget('unknown')()).not.toThrow();
  });

  it('answers 503 SERVICE_BUSY without calling the provider, and keeps serving what is cached', async () => {
    const provider = createFakeProvider();
    let busy = false;
    const service = new WeatherService(provider, undefined, undefined, () => {
      if (busy) throw new BusyError();
    });
    const app = createApp(service);
    await request(app).get('/api/forecast?lat=52.23&lon=21.01');

    busy = true;
    const cached = await request(app).get('/api/forecast?lat=52.23&lon=21.01');
    expect(cached.status).toBe(200);
    const fresh = await request(app).get('/api/forecast?lat=50.06&lon=19.94');
    expect(fresh.status).toBe(503);
    expect(fresh.body.error.code).toBe('SERVICE_BUSY');
    expect(fresh.headers['cache-control']).toBe('no-store');
    expect(provider.getForecast).toHaveBeenCalledTimes(1);
  });

  it('logs no line per place when a batch is refused: the budget logs refusals itself', async () => {
    const warn = vi.fn();
    const logger = { ...silentLogger, warn } as unknown as typeof silentLogger;
    const service = new WeatherService(createFakeProvider(), undefined, undefined, () => {
      throw new BusyError();
    });
    const res = await request(createApp(service, { logger })).get('/api/forecasts?places=52.23,21.01;50.06,19.94');
    expect(res.status).toBe(503);
    expect(warn).not.toHaveBeenCalled();
  });

  it('counts Open-Meteo requests as Open-Meteo does: by variables and days, at least one', async () => {
    // Its FAQ's example: 15 variables over 2 weeks is 1.5 calls; 4 weeks of it, 3.
    const at = (query: string) => new URL(`https://api.open-meteo.com/v1/forecast?${query}`);
    expect(openMeteoWeight(at(`hourly=${Array(15).fill('x').join(',')}&forecast_days=14`))).toBe(1.5);
    expect(openMeteoWeight(at(`hourly=${Array(15).fill('x').join(',')}&forecast_days=28`))).toBe(3);
    expect(openMeteoWeight(new URL('https://geocoding-api.open-meteo.com/v1/search?name=warsaw'))).toBe(1);

    // What our own requests cost, from the URLs the adapter builds.
    const urls: URL[] = [];
    const provider = new OpenMeteoProvider(async (input) => {
      urls.push(new URL(String(input)));
      throw new Error('not sent');
    });
    await provider.getForecast(52.23, 21.01, 10).catch(() => {});
    await provider.getAirQuality(52.23, 21.01).catch(() => {});
    const [forecast, airQuality] = urls.map(openMeteoWeight);
    expect(forecast).toBeCloseTo(2.2);
    expect(airQuality).toBe(1);
  });

  it('refuses an approximate location near the ipwho.is cap, and still answers a cached address', async () => {
    let busy = false;
    const locate = vi.fn(async () => ({ latitude: 52.23, longitude: 21.01 }));
    const places = new PlaceService({ reverse: async () => null }, { searchLocations: async () => [] });
    const approximate = new ApproximateLocationService({ locate }, places, false, () => {
      if (busy) throw new BusyError();
    });
    const app = createApp(new WeatherService(createFakeProvider()), { places, approximate, trustProxy: true });
    const from = (ip: string) => request(app).get('/api/places/approximate').set('X-Forwarded-For', ip);

    await from('198.51.100.1');
    busy = true;
    expect((await from('198.51.100.1')).status).not.toBe(503);
    const refused = await from('198.51.100.2');
    expect(refused.status).toBe(503);
    expect(refused.body.error.code).toBe('SERVICE_BUSY');
    expect(locate).toHaveBeenCalledTimes(1);
  });
});
