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

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.test/api/locations?q=S%C3%A3o+Paulo',
      expect.anything(),
    );

    await api.searchLocations('Warsaw', { language: 'pl' });
    expect(fetchFn).toHaveBeenLastCalledWith(
      'https://api.test/api/locations?q=Warsaw&lang=pl',
      expect.anything(),
    );
  });

  it('gets a place by id in a language', async () => {
    const fetchFn = vi.fn(async () => json({ id: 756135, name: 'Варшава' }));
    const api = createApiClient({ baseUrl: '', fetchFn });

    await api.getLocation(756135, { language: 'ru' });

    expect(fetchFn).toHaveBeenCalledWith('/api/locations/756135?lang=ru', expect.anything());
  });

  it('turns API error bodies into ApiError with the server code', async () => {
    const fetchFn = vi.fn(async () =>
      json({ error: { code: 'PROVIDER_ERROR', message: 'Down' } }, 502),
    );
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
