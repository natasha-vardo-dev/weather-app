import { describe, expect, it } from 'vitest';
import { TtlCache } from '../src/services/cache.js';

describe('TtlCache', () => {
  it('returns a value before it expires and drops it after', () => {
    let now = 0;
    const cache = new TtlCache<string>(1000, 10, () => now);
    cache.set('a', 'value');
    now = 999;
    expect(cache.get('a')).toBe('value');
    now = 1000;
    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts the oldest entry when full', () => {
    const cache = new TtlCache<number>(10_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('joins loads of one key already in flight instead of starting another', async () => {
    const cache = new TtlCache<string>(10_000);
    let release!: (value: string) => void;
    let loads = 0;
    const load = () => {
      loads += 1;
      return new Promise<string>((resolve) => (release = resolve));
    };

    const all = Promise.all(Array.from({ length: 10 }, () => cache.getOrLoad('warsaw', load)));
    release('forecast');

    expect(await all).toEqual(Array(10).fill('forecast'));
    expect(loads).toBe(1);
    expect(cache.stats()).toMatchObject({ misses: 1, coalesced: 9, hits: 0, size: 1 });
    await cache.getOrLoad('warsaw', load);
    expect(cache.stats().hits).toBe(1);
  });

  it('gives a failed load to everyone waiting and does not cache it', async () => {
    const cache = new TtlCache<string>(10_000);
    let fail!: (error: Error) => void;
    const failing = () => new Promise<string>((_, reject) => (fail = reject));

    const first = cache.getOrLoad('a', failing);
    const second = cache.getOrLoad('a', failing);
    fail(new Error('provider down'));
    await expect(first).rejects.toThrow('provider down');
    await expect(second).rejects.toThrow('provider down');

    // The next call loads again.
    await expect(cache.getOrLoad('a', async () => 'ok')).resolves.toBe('ok');
    expect(cache.get('a')).toBe('ok');
  });

  it('does not cache a value `keep` refuses, but still returns it', async () => {
    const cache = new TtlCache<string>(10_000);
    await expect(
      cache.getOrLoad(
        'a',
        async () => 'fallback',
        () => false,
      ),
    ).resolves.toBe('fallback');
    expect(cache.get('a')).toBeUndefined();
  });
});
