import { describe, expect, it, vi } from 'vitest';
import { createQueryCache } from '../src/api/queryCache';

describe('createQueryCache', () => {
  it('returns a loaded value synchronously until it expires', async () => {
    let time = 0;
    const cache = createQueryCache<string>({ ttlMs: 1000, now: () => time });

    expect(cache.get('a')).toBeUndefined();
    await cache.load('a', async () => 'value');
    expect(cache.get('a')).toBe('value');

    time = 1001;
    expect(cache.get('a')).toBeUndefined();
  });

  it('shares one request between concurrent loads of a key', async () => {
    const cache = createQueryCache<string>({ ttlMs: 1000 });
    const fetcher = vi.fn(async () => 'value');

    const [a, b] = await Promise.all([cache.load('k', fetcher), cache.load('k', fetcher)]);

    expect([a, b]).toEqual(['value', 'value']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not cache errors', async () => {
    const cache = createQueryCache<string>({ ttlMs: 1000 });
    await expect(cache.load('k', async () => Promise.reject(new Error('down')))).rejects.toThrow('down');

    expect(cache.get('k')).toBeUndefined();
    expect(await cache.load('k', async () => 'ok')).toBe('ok');
  });

  it('drops the oldest entry above the size limit', async () => {
    const cache = createQueryCache<number>({ ttlMs: 1000, maxEntries: 2 });
    await cache.load('a', async () => 1);
    await cache.load('b', async () => 2);
    await cache.load('c', async () => 3);

    expect(cache.get('a')).toBeUndefined();
    expect([cache.get('b'), cache.get('c')]).toEqual([2, 3]);
  });
});
