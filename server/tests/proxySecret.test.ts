import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Metrics } from '../src/observability/metrics.js';
import { silentLogger } from '../src/observability/logger.js';
import { WeatherService } from '../src/services/weatherService.js';
import { createFakeProvider } from './fakeProvider.js';

const SECRET = 'proxy-secret-1234567890';
const FORECAST = '/api/v1/forecast?lat=52.23&lon=21.01';

function setup(proxySecret?: string) {
  return createApp(new WeatherService(createFakeProvider()), {
    proxySecret,
    // Two proxies trusted, as on Vercel + Render: the case a forged X-Forwarded-For got through.
    trustProxy: 2,
    rateLimits: { api: 2, forecasts: 1, search: 1, places: 1, clientErrors: 1 },
    metrics: new Metrics(silentLogger),
    metricsSecret: 'metrics-secret-1234567890',
  });
}

describe('proxy secret', () => {
  it('serves every request when no secret is set (local development)', async () => {
    expect((await request(setup()).get(FORECAST)).status).toBe(200);
  });

  it('refuses requests without the secret or with a wrong one, as an unknown endpoint', async () => {
    const app = setup(SECRET);
    const missing = await request(app).get(FORECAST);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    expect(missing.headers['cache-control']).toBe('no-store');
    expect((await request(app).get(FORECAST).set('X-Proxy-Secret', 'wrong')).status).toBe(404);
    expect((await request(app).get(FORECAST).set('X-Proxy-Secret', SECRET)).status).toBe(200);
  });

  it('does not count refused requests as clients of an API version', async () => {
    const app = setup(SECRET);
    await request(app).get(FORECAST);
    await request(app).get(FORECAST).set('X-Proxy-Secret', SECRET);
    const metrics = await request(app)
      .get('/api/internal/metrics')
      .set('Authorization', 'Bearer metrics-secret-1234567890');
    expect(metrics.body.apiVersions).toEqual({ v1: 1 });
  });

  it('leaves health and the internal endpoints to their own rules', async () => {
    const app = setup(SECRET);
    expect((await request(app).get('/api/health')).status).toBe(200);
    const metrics = await request(app)
      .get('/api/internal/metrics')
      .set('Authorization', 'Bearer metrics-secret-1234567890');
    expect(metrics.status).toBe(200);
  });

  it('stops forged addresses: without the secret a new X-Forwarded-For per request gets nowhere', async () => {
    const app = setup(SECRET);
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).get(FORECAST).set('X-Forwarded-For', `203.0.113.${i}, 10.0.0.1`);
      expect(res.status).toBe(404);
    }
  });

  it("limits by the proxy's X-Client-IP, trusted only with the secret", async () => {
    const app = setup(SECRET);
    const as = (ip: string) => request(app).get(FORECAST).set('X-Proxy-Secret', SECRET).set('X-Client-IP', ip);
    expect((await as('198.51.100.1')).status).toBe(200);
    expect((await as('198.51.100.1')).status).toBe(200);
    expect((await as('198.51.100.1')).status).toBe(429);
    // Another user behind the same proxy has an allowance of their own.
    expect((await as('198.51.100.2')).status).toBe(200);
  });
});
