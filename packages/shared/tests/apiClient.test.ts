import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '../src/apiClient.js';
import { isRetryable } from '../src/errors.js';

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

  // The API down: the site's proxy answers 502/504 with its own page. As INTERNAL it was not
  // retryable, so the page offered no "Try again"; as NETWORK_ERROR it told the user to check
  // an internet connection that works.
  it('reports a server error without the API error body as SERVER_UNAVAILABLE, which can be retried', async () => {
    for (const status of [502, 503, 504]) {
      const fetchFn = vi.fn(async () => new Response('<html>Bad gateway</html>', { status }));
      const error = await createApiClient({ baseUrl: '', fetchFn })
        .getForecast(1, 1)
        .catch((e) => e);
      expect(error).toMatchObject({ code: 'SERVER_UNAVAILABLE', status });
      expect(isRetryable(error.code)).toBe(true);
    }
  });

  it('keeps a client error without the API error body INTERNAL', async () => {
    const fetchFn = vi.fn(async () => new Response('Not here', { status: 404 }));
    const error = await createApiClient({ baseUrl: '', fetchFn })
      .getForecast(1, 1)
      .catch((e) => e);
    expect(error).toMatchObject({ code: 'INTERNAL', status: 404 });
  });

  describe('timeout', () => {
    /** A fetch that never answers, rejecting like the platform's when its signal aborts. */
    const stalled = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );

    it('fails a request with no answer as NETWORK_ERROR once the time is up', async () => {
      vi.useFakeTimers();
      try {
        const api = createApiClient({ baseUrl: '', fetchFn: stalled, timeoutMs: 1000 });
        const result = api.getForecast(1, 1).catch((e) => e);
        await vi.advanceTimersByTimeAsync(999);
        expect(stalled.mock.lastCall![1]!.signal!.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(await result).toMatchObject({ code: 'NETWORK_ERROR' });
      } finally {
        vi.useRealTimers();
      }
    });

    it("still passes the caller's own abort on as an AbortError", async () => {
      const controller = new AbortController();
      const api = createApiClient({ baseUrl: '', fetchFn: stalled, timeoutMs: 1000 });
      const result = api.searchLocations('Warsaw', { signal: controller.signal }).catch((e) => e);
      controller.abort();
      expect(await result).toMatchObject({ name: 'AbortError' });
    });

    it('fails an answer whose body stalls as NETWORK_ERROR', async () => {
      vi.useFakeTimers();
      try {
        const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
          const body = new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener('abort', () =>
                controller.error(new DOMException('Aborted', 'AbortError')),
              );
            },
          });
          return new Response(body, { headers: { 'Content-Type': 'application/json' } });
        });
        const api = createApiClient({ baseUrl: '', fetchFn, timeoutMs: 1000 });
        const result = api.getForecast(1, 1).catch((e) => e);
        await vi.advanceTimersByTimeAsync(1000);
        expect(await result).toMatchObject({ code: 'NETWORK_ERROR' });
        // Not asked again past the HTTP cache, as an unreadable answer would be.
        expect(fetchFn).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
