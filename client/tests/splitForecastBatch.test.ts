import { createApiClient } from '@weather/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { splitForecastBatch } from '../src/sw/splitForecastBatch';

const stored = new Map<string, Response>();
vi.stubGlobal('caches', {
  open: async () => ({
    put: async (url: string, response: Response) => void stored.set(url, response),
    keys: async () => [...stored.keys()].map((url) => new Request(url)),
    match: async (request: Request) => stored.get(request.url)?.clone(),
    delete: async (request: Request) => stored.delete(request.url),
  }),
});
afterEach(() => stored.clear());

/** The URLs the app's API client asks for, so the copies are found exactly where it looks. */
function urlsOf(call: (client: ReturnType<typeof createApiClient>) => Promise<unknown>): Promise<string[]> {
  const urls: string[] = [];
  const client = createApiClient({
    baseUrl: 'https://weather.test',
    fetchFn: async (input) => {
      urls.push(String(input));
      return new Response('{}');
    },
  });
  return call(client).then(
    () => urls,
    () => urls,
  );
}

const places = [
  { latitude: 52.23, longitude: 21.01 },
  { latitude: 41.24, longitude: -85.85 },
];

async function split(body: unknown, headers: Record<string, string> = {}) {
  const [batchUrl] = await urlsOf((client) => client.getForecasts(places));
  await splitForecastBatch({
    cacheName: 'api',
    request: new Request(batchUrl!),
    newResponse: new Response(JSON.stringify(body), { headers }),
  });
}

describe('splitForecastBatch', () => {
  it('stores each forecast of a batch under the URL its city page asks for', async () => {
    await split(
      { forecasts: [{ forecast: { at: 'warsaw' } }, { forecast: { at: 'indiana' } }] },
      { Date: 'Fri, 30 Oct 2026 12:00:00 GMT' },
    );
    const single = await urlsOf((client) =>
      Promise.all(places.map((p) => client.getForecast(p.latitude, p.longitude))),
    );

    expect([...stored.keys()]).toEqual(single);
    expect(await stored.get(single[0]!)!.json()).toEqual({ at: 'warsaw' });
    expect(stored.get(single[1]!)!.headers.get('Date')).toBe('Fri, 30 Oct 2026 12:00:00 GMT');
  });

  it('skips places that failed', async () => {
    await split({ forecasts: [{ forecast: { at: 'warsaw' } }, { error: { code: 'PROVIDER_ERROR', message: '' } }] });
    expect(stored.size).toBe(1);
  });

  it('ignores answers of another shape and other URLs', async () => {
    await split({ unexpected: true });
    await split({ forecasts: [{ forecast: {} }] });
    await splitForecastBatch({
      cacheName: 'api',
      request: new Request('https://weather.test/api/forecast?lat=1&lon=1&days=10'),
      newResponse: new Response('{}'),
    });
    expect(stored.size).toBe(0);
  });

  it('deletes city copies older than a day when a batch is stored, and keeps fresh ones', async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toUTCString();
    stored.set('https://weather.test/api/forecast?lat=1&lon=1&days=10', new Response('{}', { headers: { Date: old } }));
    stored.set('https://weather.test/api/air-quality?lat=1&lon=1', new Response('{}', { headers: { Date: old } }));

    await split({ forecasts: [{ forecast: {} }, { forecast: {} }] }, { Date: new Date().toUTCString() });

    expect([...stored.keys()].sort()).toEqual([
      'https://weather.test/api/air-quality?lat=1&lon=1',
      'https://weather.test/api/forecast?lat=41.24&lon=-85.85&days=10',
      'https://weather.test/api/forecast?lat=52.23&lon=21.01&days=10',
    ]);
  });
});
