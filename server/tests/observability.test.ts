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

describe('GET /api/health/quota', () => {
  function setup() {
    let now = 10 * 24 * 60 * MINUTE;
    const metrics = new Metrics(silentLogger, () => now);
    const record = metrics.provider('open-meteo', { perMinute: 10, perDay: 1000 });
    const app = createApp(new WeatherService(createFakeProvider()), { metrics });
    return { app, record, later: (ms: number) => (now += ms) };
  }

  it('is ok below 80% of every limit, never cached', async () => {
    const { app, record } = setup();
    for (let i = 0; i < 7; i++) record(true);
    const res = await request(app).get('/api/health/quota');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('answers 503 with the limits used to 80% or more, so a monitor alerts', async () => {
    const { app, record, later } = setup();
    for (let i = 0; i < 8; i++) record(true);
    const res = await request(app).get('/api/health/quota');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: 'near-limit',
      near: [{ provider: 'open-meteo', window: 'perMinute', share: 0.8 }],
    });

    // Clears once the window moves on.
    later(2 * MINUTE);
    expect((await request(app).get('/api/health/quota')).status).toBe(200);
  });

  it('is not counted as an API version', async () => {
    const service = new WeatherService(createFakeProvider());
    const metrics = new Metrics(silentLogger);
    const app = createApp(service, { metrics, metricsSecret: 'metrics-secret-123' });
    await request(app).get('/api/health/quota');
    // A look-alike outside health is an /api path without a version, as before.
    await request(app).get('/api/healthz');
    const res = await request(app).get('/api/internal/metrics').set('Authorization', 'Bearer metrics-secret-123');
    expect(res.body.apiVersions).toEqual({ none: 1 });
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
    await request(app).get('/api/v1/forecast?lat=52.23&lon=21.01');
    await request(app).get('/api/v1/forecast?lat=52.23&lon=21.01');
    await request(app).get('/api/v1/forecast?lat=200&lon=21.01');

    const res = await request(app).get('/api/internal/metrics').set('Authorization', 'Bearer metrics-secret-123');
    expect(res.status).toBe(200);
    expect(res.body.caches.forecast).toMatchObject({ hits: 1, misses: 1, hitRate: 0.5 });
    expect(res.body.requests).toMatchObject({ '2xx': 2, '4xx': 1 });
  });

  it('counts requests per API version, leaving out health and internal ones', async () => {
    const { app } = setup();
    await request(app).get('/api/v1/forecast?lat=52.23&lon=21.01');
    await request(app).get('/api/forecast?lat=52.23&lon=21.01');
    await request(app).get('/api/health');
    // Made-up versions share one name, however many there are.
    await request(app).get('/api/v2/forecast');
    await request(app).get('/api/v987654321/forecast');

    const res = await request(app).get('/api/internal/metrics').set('Authorization', 'Bearer metrics-secret-123');
    expect(res.body.apiVersions).toEqual({ v1: 1, none: 1, other: 2 });
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
  it('counts each call when sent, and failures (HTTP errors, network errors) as errors', async () => {
    const metrics = new Metrics(silentLogger);
    const responses = [new Response('{}', { status: 200 }), new Response('', { status: 503 })];
    let release!: () => void;
    const fetchFn = vi.fn(async () => {
      const next = responses.shift();
      if (next) return next;
      await new Promise<void>((resolve) => (release = resolve));
      throw new TypeError('fetch failed');
    });
    const counted = instrumentFetch(
      'test',
      metrics.provider('test', { perMinute: 10 }),
      silentLogger,
      fetchFn as typeof fetch,
    );

    await counted('https://api.example.com/v1/forecast?latitude=52.23');
    await counted('https://api.example.com/v1/forecast?latitude=52.23');
    const pending = counted('https://api.example.com/v1/forecast');
    // Still under way, already counted: the budget sees it.
    expect(metrics.snapshot().providers.test!.lastMinute).toBe(3);
    release();
    await expect(pending).rejects.toThrow('fetch failed');
    expect(metrics.snapshot().providers.test).toMatchObject({ lastMinute: 3, errorsLastDay: 2 });
  });
});
