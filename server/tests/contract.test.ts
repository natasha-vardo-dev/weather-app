import {
  airQualitySchema,
  alertsResponseSchema,
  alertTopicsResponseSchema,
  API_PREFIX,
  apiErrorBodySchema,
  forecastSchema,
  forecastsResponseSchema,
  locationSchema,
  locationsResponseSchema,
  reversePlaceSchema,
} from '@weather/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { createApp } from '../src/app.js';
import { ProviderError } from '../src/errors.js';
import type { AlertBroadcastSource, AlertsProvider, PushSender } from '../src/providers/types.js';
import { AlertService } from '../src/services/alertService.js';
import { ApproximateLocationService } from '../src/services/approximateService.js';
import { PlaceService } from '../src/services/placeService.js';
import { WeatherService } from '../src/services/weatherService.js';
import { createFakeProvider } from './fakeProvider.js';

/**
 * Every endpoint of the contract, answered as the schemas in @weather/shared say: success and
 * error alike. Strict schemas, so a field the server sends but the contract does not list fails
 * here (and the OpenAPI description, generated from the schemas, would not show it). The
 * adapters' own output is checked against the same schemas in their tests (openMeteo.test.ts).
 */
function setup() {
  const provider = createFakeProvider();
  const service = new WeatherService(provider);
  const places = new PlaceService({ reverse: vi.fn(async () => ({ name: 'Warsaw', country: 'Poland' })) }, service);
  const approximate = new ApproximateLocationService(
    { locate: vi.fn(async () => ({ latitude: 52.23, longitude: 21.01 })) },
    places,
    false,
  );
  const alertsProvider: AlertsProvider = {
    attribution: { name: 'EUMETNET – MeteoAlarm', url: 'https://meteoalarm.org' },
    covers: async () => true,
    getAlerts: async () => [
      {
        id: 'warning-1',
        level: 'orange',
        type: 'wind',
        onset: '2026-10-15T10:00:00+02:00',
        expires: '2099-10-16T10:00:00+02:00',
        texts: [{ language: 'en-GB', event: 'Orange wind warning', headline: 'Strong wind', sender: 'IMGW-PIB' }],
      },
    ],
  };
  const source: AlertBroadcastSource = {
    areasAt: async () => ['PL1465'],
    listWarnings: async () => ({ warnings: [], read: [] }),
    loadWarning: async () => null,
  };
  const sender: PushSender = { subscribe: vi.fn(async () => {}), unsubscribe: vi.fn(async () => {}), send: vi.fn() };
  const app = createApp(service, {
    places,
    approximate,
    alerts: new AlertService(alertsProvider),
    push: { source, sender },
    // A public address for the approximate location (private ones are local development).
    trustProxy: 1,
  });
  return { app, provider };
}

function conforms(schema: z.ZodType, body: unknown) {
  const result = schema.safeParse(body);
  expect(result.success, result.error?.message).toBe(true);
}

describe('API contract', () => {
  const at = (path: string) => `${API_PREFIX}${path}`;

  it.each([
    ['/locations?q=war', locationsResponseSchema],
    ['/locations/756135', locationSchema],
    ['/forecast?lat=52.23&lon=21.01', forecastSchema],
    ['/forecasts?places=52.23,21.01;50.06,19.94', forecastsResponseSchema],
    ['/air-quality?lat=52.23&lon=21.01', airQualitySchema],
    ['/places/reverse?lat=52.25&lon=21.05', reversePlaceSchema],
  ] as const)('GET %s', async (path, schema) => {
    const { app } = setup();
    const res = await request(app).get(at(path)).set('X-Forwarded-For', '203.0.113.7');
    expect(res.status).toBe(200);
    conforms(schema, res.body);
  });

  it('GET /places/approximate', async () => {
    const { app } = setup();
    const res = await request(app).get(at('/places/approximate')).set('X-Forwarded-For', '203.0.113.7');
    expect(res.status).toBe(200);
    conforms(reversePlaceSchema, res.body);
  });

  it('GET /alerts lists warnings in the contract shape', async () => {
    const { app } = setup();
    const res = await request(app).get(at('/alerts?lat=52.23&lon=21.01'));
    expect(res.body.alerts).toHaveLength(1);
    conforms(alertsResponseSchema, res.body);
  });

  it('a batch with one place failing', async () => {
    const { app, provider } = setup();
    provider.getForecast.mockImplementation(async (lat) => {
      if (lat === 50.06) throw new ProviderError('down');
      return (await import('./fakeProvider.js')).sampleForecast;
    });
    const res = await request(app).get(at('/forecasts?places=52.23,21.01;50.06,19.94'));
    expect(res.status).toBe(200);
    expect(res.body.forecasts[1]).toHaveProperty('error');
    conforms(forecastsResponseSchema, res.body);
  });

  it('POST /push/topics', async () => {
    const { app } = setup();
    const res = await request(app)
      .post(at('/push/topics'))
      .send({
        token: 'x'.repeat(40),
        latitude: 52.23,
        longitude: 21.01,
        group: 'storm',
        level: 'orange',
        subscribe: true,
      });
    expect(res.status).toBe(200);
    conforms(alertTopicsResponseSchema, res.body);
  });

  it('POST /client-errors answers with no body', async () => {
    const { app } = setup();
    const res = await request(app)
      .post(at('/client-errors'))
      .send({ kind: 'error', message: 'Boom', path: '/', release: 'dev' });
    expect(res.status).toBe(204);
  });

  it.each([
    ['invalid request', '/forecast?lat=200&lon=21', 400],
    ['unknown place', '/locations/999999', 404],
    ['unknown endpoint', '/nothing-here', 404],
  ] as const)('errors: %s', async (_name, path, status) => {
    const { app, provider } = setup();
    provider.getLocation.mockResolvedValue(null);
    const res = await request(app).get(at(path));
    expect(res.status).toBe(status);
    conforms(apiErrorBodySchema, res.body);
  });

  it('errors: provider down', async () => {
    const { app, provider } = setup();
    provider.getForecast.mockRejectedValue(new ProviderError('down'));
    const res = await request(app).get(at('/forecast?lat=52.23&lon=21.01'));
    expect(res.status).toBe(502);
    conforms(apiErrorBodySchema, res.body);
  });
});
