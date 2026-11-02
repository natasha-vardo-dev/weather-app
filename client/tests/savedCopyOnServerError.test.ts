import { afterEach, describe, expect, it, vi } from 'vitest';
import { markServerErrorCopy, savedCopyOnServerError } from '../src/sw/savedCopyOnServerError';

/** Saved copies by URL, with the Date header each was stored with (null: none). */
const saved = new Map<string, string | null>();
vi.stubGlobal('caches', {
  match: async (request: Request) => {
    if (!saved.has(request.url)) return undefined;
    const date = saved.get(request.url);
    return new Response('{}', { headers: date ? { Date: date } : {} });
  },
});
afterEach(() => saved.clear());

const HOUR = 60 * 60 * 1000;
const savedAgo = (ms: number) => new Date(Date.now() - ms).toUTCString();

const URL = 'https://weather.test/api/v1/forecast?lat=52.23&lon=21.01';
const answer = (status: number) => new Response('<html>Bad gateway</html>', { status });

describe('savedCopyOnServerError', () => {
  it('fails a server error when a copy is saved, so NetworkFirst shows the copy', async () => {
    saved.set(URL, savedAgo(HOUR));
    for (const status of [500, 502, 503, 504]) {
      await expect(savedCopyOnServerError({ request: new Request(URL), response: answer(status) })).rejects.toThrow();
    }
  });

  it('passes a server error on when there is no copy, so the page can offer "Try again"', async () => {
    const response = answer(502);
    expect(await savedCopyOnServerError({ request: new Request(URL), response })).toBe(response);
  });

  it('passes answers and client errors on, a copy or not', async () => {
    saved.set(URL, savedAgo(HOUR));
    for (const status of [200, 404, 429]) {
      const response = answer(status);
      expect(await savedCopyOnServerError({ request: new Request(URL), response })).toBe(response);
    }
  });

  it('passes a server error on when the copy is too old for NetworkFirst to use', async () => {
    saved.set(URL, savedAgo(25 * HOUR));
    const response = answer(503);
    expect(await savedCopyOnServerError({ request: new Request(URL), response })).toBe(response);
  });

  it('takes a copy without a Date header as fresh, as the expiration plugin does', async () => {
    saved.set(URL, null);
    await expect(savedCopyOnServerError({ request: new Request(URL), response: answer(502) })).rejects.toThrow();
  });

  it('marks the copy it makes NetworkFirst use as one for a server error', async () => {
    saved.set(URL, savedAgo(HOUR));
    const state: Record<string, unknown> = {};
    await expect(savedCopyOnServerError({ request: new Request(URL), response: answer(502), state })).rejects.toThrow();

    const copy = await markServerErrorCopy({ cachedResponse: new Response('{}'), state });
    expect(copy?.headers.get('X-From-Cache')).toBe('server');
    // Without a server error (a network failure, a timeout) the copy is left for the next plugin to mark.
    const plain = new Response('{}');
    expect(await markServerErrorCopy({ cachedResponse: plain, state: {} })).toBe(plain);
    expect(await markServerErrorCopy({ cachedResponse: null, state })).toBeNull();
  });
});
