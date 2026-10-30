import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { silentLogger } from '../src/observability/logger.js';
import { instrumentFetch, Metrics } from '../src/observability/metrics.js';
import { WeatherService } from '../src/services/weatherService.js';
import { createFakeProvider } from './fakeProvider.js';

const MINUTE = 60_000;

describe('GET /api/health', () => {
  it('answers without asking the provider, never cached', async () => {
    const provider = createFakeProvider();
    const app = createApp(new WeatherService(provider), { version: 'abc1234' });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', uptimeSeconds: expect.any(Number), version: 'abc1234' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(provider.getForecast).not.toHaveBeenCalled();
  });
});

describe('GET /api/internal/metrics', () => {
  function setup() {
    const service = new WeatherService(createFakeProvider());
    const metrics = new Metrics(silentLogger);
    metrics.cache('forecast', () => service.cacheStats().forecast);
    const app = createApp(service, { metrics, metricsSecret: 'metrics-secret-123' });
    return { app };
  }

  it('reports cache hit rates and requests to those with the secret', async () => {
    const { app } = setup();
    await request(app).get('/api/forecast?lat=52.23&lon=21.01');
    await request(app).get('/api/forecast?lat=52.23&lon=21.01');
    await request(app).get('/api/forecast?lat=200&lon=21.01');

    const res = await request(app).get('/api/internal/metrics').set('Authorization', 'Bearer metrics-secret-123');
    expect(res.status).toBe(200);
    expect(res.body.caches.forecast).toMatchObject({ hits: 1, misses: 1, hitRate: 0.5 });
    expect(res.body.requests).toMatchObject({ '2xx': 2, '4xx': 1 });
  });

  it('does not exist for anyone else', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/internal/metrics')).status).toBe(404);
    expect((await request(app).get('/api/internal/metrics').set('Authorization', 'Bearer wrong')).status).toBe(404);
  });
});

describe('Metrics', () => {
  it('counts provider calls per minute, hour and day against the limits', () => {
    let now = 10 * 24 * 60 * MINUTE;
    const metrics = new Metrics(silentLogger, () => now);
    const record = metrics.provider('open-meteo', { perMinute: 600, perHour: 5000, perDay: 10_000 });

    record(true);
    record(false);
    now += 30 * MINUTE;
    record(true);
    now += 2 * MINUTE;

    const usage = metrics.snapshot().providers['open-meteo']!;
    expect(usage).toMatchObject({ lastMinute: 0, lastHour: 3, lastDay: 3, errorsLastDay: 1 });
    expect(usage.share).toEqual({ perMinute: 0, perHour: 0.001, perDay: 0 });

    now += 24 * 60 * MINUTE;
    expect(metrics.snapshot().providers['open-meteo']).toMatchObject({ lastHour: 0, lastDay: 0 });
  });

  it('counts the last minute as a sliding window, across the change of minute', () => {
    let now = 50_000; // hh:00:50
    const warn = vi.fn();
    const logger = { ...silentLogger, warn } as unknown as typeof silentLogger;
    const metrics = new Metrics(logger, () => now);
    const record = metrics.provider('open-meteo', { perMinute: 600 });

    for (let i = 0; i < 400; i += 1) record(true);
    now = 70_000; // hh:01:10: the first burst's minute is 50 s of the last 60
    for (let i = 0; i < 400; i += 1) record(true);

    // 400 × 50/60 + 400; whole buckets only would say 400.
    expect(metrics.snapshot().providers['open-meteo']!.lastMinute).toBe(733);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ window: 'perMinute' }), 'provider usage near limit');
  });

  it('warns once per window when usage passes 80% of a limit', () => {
    const now = 0;
    const warn = vi.fn();
    const logger = { ...silentLogger, warn } as unknown as typeof silentLogger;
    const metrics = new Metrics(logger, () => now);
    const record = metrics.provider('open-meteo', { perMinute: 10 });

    for (let i = 0; i < 7; i += 1) record(true);
    expect(warn).not.toHaveBeenCalled();
    record(true);
    record(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatchObject({ provider: 'open-meteo', window: 'perMinute', share: 0.8 });
  });
});

describe('instrumentFetch', () => {
  it('counts successes and failures, including network errors', async () => {
    const outcomes: boolean[] = [];
    const responses = [new Response('{}', { status: 200 }), new Response('', { status: 503 })];
    const fetchFn = vi.fn(async () => {
      const next = responses.shift();
      if (!next) throw new TypeError('fetch failed');
      return next;
    });
    const counted = instrumentFetch('test', (ok) => outcomes.push(ok), silentLogger, fetchFn as typeof fetch);

    await counted('https://api.example.com/v1/forecast?latitude=52.23');
    await counted('https://api.example.com/v1/forecast?latitude=52.23');
    await expect(counted('https://api.example.com/v1/forecast')).rejects.toThrow('fetch failed');
    expect(outcomes).toEqual([true, false, false]);
  });
});
