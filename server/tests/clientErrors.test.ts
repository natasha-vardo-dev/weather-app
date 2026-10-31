import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { silentLogger } from '../src/observability/logger.js';
import { Metrics } from '../src/observability/metrics.js';
import { WeatherService } from '../src/services/weatherService.js';
import { createFakeProvider } from './fakeProvider.js';

function setup() {
  const warn = vi.fn();
  const logger = { ...silentLogger, warn } as unknown as typeof silentLogger;
  const metrics = new Metrics(silentLogger);
  const app = createApp(new WeatherService(createFakeProvider()), {
    logger,
    metrics,
    rateLimits: { api: 100, forecasts: 10, search: 10, places: 10, clientErrors: 2 },
  });
  return { app, warn, metrics };
}

const report = {
  kind: 'render',
  message: "Cannot read properties of undefined (reading 'temperature')",
  stack: 'TypeError: …\n    at CurrentWeather (index-abc.js:1:2345)',
  componentStack: '\n    at CurrentWeather\n    at WeatherPage',
  path: '/weather/:place',
  release: 'abc1234',
};

describe('POST /api/v1/client-errors', () => {
  it('logs a report from the browser as a warning, with the browser, and answers 204', async () => {
    const { app, warn, metrics } = setup();
    const res = await request(app).post('/api/v1/client-errors').set('User-Agent', 'Firefox/140').send(report);
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledWith({ ...report, userAgent: 'Firefox/140' }, 'client error');
    expect(metrics.snapshot().clientErrors).toBe(1);
  });

  it('refuses what does not look like a report', async () => {
    const { app, warn } = setup();
    const bad = await request(app).post('/api/v1/client-errors').send({ kind: 'other', message: 'x', path: '/' });
    expect(bad.status).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/v1/client-errors')
          .send({ ...report, message: 'x'.repeat(501) })
      ).status,
    ).toBe(400);
    expect(warn).not.toHaveBeenCalled();
  });

  it('takes a few reports a minute from one address, not a flood', async () => {
    const { app, warn } = setup();
    expect((await request(app).post('/api/v1/client-errors').send(report)).status).toBe(204);
    expect((await request(app).post('/api/v1/client-errors').send(report)).status).toBe(204);
    expect((await request(app).post('/api/v1/client-errors').send(report)).status).toBe(429);
    expect(warn.mock.calls.filter(([, message]) => message === 'client error')).toHaveLength(2);
  });
});
