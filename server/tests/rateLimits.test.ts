import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Metrics } from '../src/observability/metrics.js';
import { silentLogger } from '../src/observability/logger.js';
import { WeatherService } from '../src/services/weatherService.js';
import { createFakeProvider } from './fakeProvider.js';

function setup(trustProxy: number | false = false) {
  const metrics = new Metrics(silentLogger);
  const app = createApp(new WeatherService(createFakeProvider()), {
    rateLimits: { api: 5, forecasts: 1, search: 2, places: 1, clientErrors: 2 },
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
      rateLimits: { api: 100, forecasts: 3, search: 60, places: 10, clientErrors: 10 },
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
