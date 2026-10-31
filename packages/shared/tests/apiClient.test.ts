import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '../src/apiClient.js';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createApiClient', () => {
  it('builds the URL from the base URL and parameters', async () => {
    const fetchFn = vi.fn(async () => json({ locations: [] }));
    const api = createApiClient({ baseUrl: 'https://api.test', fetchFn });

    await api.searchLocations('São Paulo');

    expect(fetchFn).toHaveBeenCalledWith('https://api.test/api/v1/locations?q=S%C3%A3o+Paulo', expect.anything());

    await api.searchLocations('Warsaw', { language: 'pl' });
    expect(fetchFn).toHaveBeenLastCalledWith('https://api.test/api/v1/locations?q=Warsaw&lang=pl', expect.anything());
  });

  it('gets a place by id in a language', async () => {
    const fetchFn = vi.fn(async () =>
      json({ id: 756135, name: 'Варшава', country: 'Польша', latitude: 52.23, longitude: 21.01 }),
    );
    const api = createApiClient({ baseUrl: '', fetchFn });

    await api.getLocation(756135, { language: 'ru' });

    expect(fetchFn).toHaveBeenCalledWith('/api/v1/locations/756135?lang=ru', expect.anything());
  });

  it('asks again past the HTTP cache when an answer has an unexpected shape', async () => {
    // A day-old answer from before a field existed, then the fresh one.
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({ name: 'Warsaw' }))
      .mockResolvedValueOnce(json({ name: 'Warsaw', latitude: 52.23, longitude: 21.01, id: 756135 }));
    const api = createApiClient({ baseUrl: '', fetchFn });

    expect(await api.reverseGeocode(52.25, 21.05)).toMatchObject({ latitude: 52.23, id: 756135 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0]![1]).not.toHaveProperty('cache');
    expect(fetchFn.mock.calls[1]![1]).toMatchObject({ cache: 'reload' });
  });

  it('fails with an error, not a crash, when the fresh answer has the wrong shape too', async () => {
    const fetchFn = vi.fn(async () => json({ forecast: 'nope' }));
    const api = createApiClient({ baseUrl: '', fetchFn });

    await expect(api.getForecast(1, 1)).rejects.toMatchObject({ name: 'ApiError', code: 'INTERNAL', status: 200 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('does not send a POST twice for a wrong answer', async () => {
    const fetchFn = vi.fn(async () => json({}));
    const api = createApiClient({ baseUrl: '', fetchFn });

    const body = { token: 't', latitude: 1, longitude: 1, group: 'storm', level: 'orange', subscribe: true } as const;
    await expect(api.setAlertTopics(body)).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('turns API error bodies into ApiError with the server code', async () => {
    const fetchFn = vi.fn(async () => json({ error: { code: 'PROVIDER_ERROR', message: 'Down' } }, 502));
    const api = createApiClient({ baseUrl: '', fetchFn });

    await expect(api.getForecast(1, 1)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      status: 502,
      message: 'Down',
    });
  });

  it('reports network failures as NETWORK_ERROR', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const api = createApiClient({ baseUrl: '', fetchFn });

    const error = await api.getForecast(1, 1).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('NETWORK_ERROR');
  });
});
