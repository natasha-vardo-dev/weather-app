import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Metrics } from '../src/observability/metrics.js';
import { RateLimitedError } from '../src/errors.js';
import { LoadLimiter, MAX_TRACKED_ADDRESSES } from '../src/rateLimits.js';
import { silentLogger } from '../src/observability/logger.js';
import { WeatherService } from '../src/services/weatherService.js';
import { createFakeProvider } from './fakeProvider.js';

function setup(trustProxy: number | false = false) {
  const metrics = new Metrics(silentLogger);
  const app = createApp(new WeatherService(createFakeProvider()), {
    rateLimits: { api: 5, forecasts: 1, search: 2, places: 1, clientErrors: 2, push: 5 },
    trustProxy,
    metrics,
  });
  return { app, metrics };
}

async function times(n: number, send: () => request.Test) {
  const results = [];
  for (let i = 0; i < n; i += 1) results.push(await send());
  return results;
}

describe('rate limits', () => {
  it('refuses requests over the limit with the API error body and RateLimit headers', async () => {
    const { app, metrics } = setup();
    const results = await times(6, () => request(app).get('/api/v1/forecast?lat=52.23&lon=21.01'));

    expect(results.slice(0, 5).map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const refused = results[5]!;
    expect(refused.status).toBe(429);
    expect(refused.body).toEqual({ error: { code: 'RATE_LIMITED', message: expect.any(String) } });
    expect(refused.headers['cache-control']).toBe('no-store');
    expect(refused.headers['retry-after']).toBeDefined();
    expect(refused.headers['ratelimit-policy']).toBeDefined();
    expect(metrics.snapshot().rateLimited).toBe(1);
  });

  it('limits search more tightly than the rest', async () => {
    const { app } = setup();
    const results = await times(3, () => request(app).get('/api/v1/locations?q=warsaw'));
    expect(results.map((r) => r.status)).toEqual([200, 200, 429]);
    // The general allowance is not used up: other endpoints still answer.
    expect((await request(app).get('/api/v1/forecast?lat=1&lon=1')).status).toBe(200);
  });

  it('never limits the health check', async () => {
    const { app } = setup();
    const results = await times(8, () => request(app).get('/api/health'));
    expect(results.every((r) => r.status === 200)).toBe(true);
  });

  it('counts per user address behind the trusted proxy', async () => {
    const { app } = setup(1);
    const from = (ip: string) => () => request(app).get('/api/v1/locations?q=warsaw').set('X-Forwarded-For', ip);
    expect((await times(3, from('203.0.113.1'))).map((r) => r.status)).toEqual([200, 200, 429]);
    // Another user behind the same proxy has their own allowance.
    expect((await request(app).get('/api/v1/locations?q=warsaw').set('X-Forwarded-For', '203.0.113.2')).status).toBe(
      200,
    );
  });

  it('ignores X-Forwarded-For when no proxy is trusted, so it cannot be used to dodge the limit', async () => {
    const { app } = setup(false);
    let n = 0;
    const spoofed = () =>
      request(app)
        .get('/api/v1/locations?q=warsaw')
        .set('X-Forwarded-For', `198.51.100.${(n += 1)}`);
    expect((await times(3, spoofed)).map((r) => r.status)).toEqual([200, 200, 429]);
  });

  it('limits batches by places: a batch of new places is up to ten provider calls', async () => {
    const provider = createFakeProvider();
    const app = createApp(new WeatherService(provider), {
      rateLimits: { api: 100, forecasts: 3, search: 60, places: 10, clientErrors: 10, push: 5 },
    });
    let n = 0;
    // A script asking for ten new places each time.
    const batch = () =>
      request(app).get(`/api/v1/forecasts?places=${Array.from({ length: 10 }, () => `${(n += 1)},0`).join(';')}`);

    const results = await times(5, batch);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 429, 429]);
    // Stopped at 30 places, as single requests would be at their own limit, not at 100 batches.
    expect(provider.getForecast).toHaveBeenCalledTimes(30);
  });
});

describe('provider calls per address', () => {
  const generous = { api: 1000, forecasts: 1000, search: 60, places: 10, clientErrors: 10, push: 5 };

  function loadsApp() {
    const provider = createFakeProvider();
    const metrics = new Metrics(silentLogger);
    const app = createApp(new WeatherService(provider), {
      rateLimits: generous,
      loadLimits: { perMinute: 3, perHour: 100 },
      trustProxy: 1,
      metrics,
    });
    const forecast = (lat: number, ip = '203.0.113.1') =>
      request(app).get(`/api/v1/forecast?lat=${lat}&lon=0`).set('X-Forwarded-For', ip);
    return { app, provider, metrics, forecast };
  }

  // Within the request limits a script could ask for ~300 new places a minute and spend the
  // daily quota everyone shares in a quarter of an hour.
  it('stops new places from one address, while cached ones and other addresses still answer', async () => {
    const { provider, metrics, forecast } = loadsApp();
    expect((await forecast(1)).status).toBe(200);
    expect((await forecast(2)).status).toBe(200);
    expect((await forecast(3)).status).toBe(200);

    const refused = await forecast(4);
    expect(refused.status).toBe(429);
    expect(refused.body).toEqual({ error: { code: 'RATE_LIMITED', message: expect.any(String) } });
    expect(refused.headers['cache-control']).toBe('no-store');
    // When the minute's allowance starts over, as the request limits say it.
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(refused.headers['retry-after'])).toBeLessThanOrEqual(60);
    expect(provider.getForecast).toHaveBeenCalledTimes(3);
    expect(metrics.snapshot().rateLimited).toBe(1);

    // From the cache: no provider call, so nothing to refuse.
    expect((await times(5, () => forecast(1))).every((r) => r.status === 200)).toBe(true);
    expect((await forecast(4, '203.0.113.2')).status).toBe(200);
  });

  it('counts air quality as well, and each new place of a batch', async () => {
    const { app, provider } = loadsApp();
    const from = (path: string) => request(app).get(path).set('X-Forwarded-For', '203.0.113.1');
    expect((await from('/api/v1/air-quality?lat=1&lon=0')).status).toBe(200);

    const batch = await from('/api/v1/forecasts?places=1,0;2,0;3,0');
    expect(batch.status).toBe(200);
    expect(batch.body.forecasts.map((item: { error?: { code: string } }) => item.error?.code ?? 'ok')).toEqual([
      'ok',
      'ok',
      'RATE_LIMITED',
    ]);
    expect(batch.headers['cache-control']).toBe('no-store');
    expect(provider.getForecast).toHaveBeenCalledTimes(2);
  });

  it('is off with the rate limits', async () => {
    const provider = createFakeProvider();
    const app = createApp(new WeatherService(provider), {
      rateLimits: false,
      loadLimits: { perMinute: 1, perHour: 1 },
    });
    const results = await times(3, () => request(app).get(`/api/v1/forecast?lat=${Math.random() * 80}&lon=0`));
    expect(results.every((r) => r.status === 200)).toBe(true);
  });
});

describe('LoadLimiter', () => {
  it('has a minute and an hour window, each reset when it ends', () => {
    let now = 0;
    const limiter = new LoadLimiter({ perMinute: 2, perHour: 3 }, undefined, undefined, () => now);
    const call = limiter.allowance('203.0.113.1');
    call();
    call();
    expect(call).toThrow(RateLimitedError);

    now = 60_000;
    call();
    // The minute is new, the hour is spent: try again when the hour starts over.
    expect(call).toThrow(expect.objectContaining({ retryAfterSeconds: 3540 }));

    now = 3_600_000;
    call();
    call();
    expect(call).toThrow(RateLimitedError);
  });

  it('counts IPv6 addresses per /56, so one host cannot take a new allowance per address', () => {
    const limiter = new LoadLimiter({ perMinute: 1, perHour: 10 }, undefined, undefined, () => 0);
    limiter.allowance('2001:db8:0:1::1')();
    expect(limiter.allowance('2001:db8:0:2::1')).toThrow(RateLimitedError);
    expect(() => limiter.allowance('2001:db8:1::1')()).not.toThrow();
  });

  it('stops counting new addresses past a bound, so memory stays bounded', () => {
    const limiter = new LoadLimiter({ perMinute: 1, perHour: 10 }, undefined, undefined, () => 0);
    for (let i = 0; i < MAX_TRACKED_ADDRESSES; i += 1)
      limiter.allowance(`10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`)();
    const late = limiter.allowance('198.51.100.1');
    late();
    // Not counted, so not refused: the global budget is what holds against this many addresses.
    expect(late).not.toThrow();
    // Addresses already counted still are.
    expect(limiter.allowance('10.0.0.0')).toThrow(RateLimitedError);
  });
});
