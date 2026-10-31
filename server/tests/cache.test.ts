import { describe, expect, it } from 'vitest';
import { TtlCache } from '../src/services/cache.js';

describe('TtlCache', () => {
  it('returns a value before it expires and drops it after', () => {
    let now = 0;
    const cache = new TtlCache<string>(1000, { now: () => now });
    cache.set('a', 'value');
    now = 999;
    expect(cache.get('a')).toBe('value');
    now = 1000;
    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts the least recently used entry when full, not the oldest', () => {
    const cache = new TtlCache<number>(10_000, { maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // a popular entry stays, though it was stored first
    cache.set('c', 3);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
    expect(cache.stats()).toMatchObject({ size: 2, evictions: 1 });
  });

  it('keeps within a budget in bytes, evicting as many entries as a big one needs', () => {
    const cache = new TtlCache<string>(10_000, { maxBytes: 10, sizeOf: (value) => value.length });
    cache.set('a', 'xxx');
    cache.set('b', 'xxx');
    cache.set('c', 'xxx');
    expect(cache.stats()).toMatchObject({ size: 3, bytes: 9 });

    cache.set('d', 'xxxxxx');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe('xxx');
    expect(cache.stats()).toMatchObject({ size: 2, bytes: 9, evictions: 2 });

    // Replacing a value counts only the new size; one bigger than the budget is not stored.
    cache.set('c', 'x');
    expect(cache.stats().bytes).toBe(7);
    cache.set('e', 'x'.repeat(11));
    expect(cache.get('e')).toBeUndefined();
    expect(cache.stats()).toMatchObject({ size: 2, bytes: 7 });
  });

  it('measures values as JSON by default', () => {
    const cache = new TtlCache<object>(10_000, { maxBytes: 1000 });
    cache.set('a', { name: 'Kraków' });
    expect(cache.stats().bytes).toBe(JSON.stringify({ name: 'Kraków' }).length + 1); // ó is two bytes
  });

  it('takes a random share off the TTL, never adds to it', () => {
    let now = 0;
    let random = 0;
    const cache = new TtlCache<string>(1000, { jitter: 0.1, now: () => now, random: () => random });
    cache.set('kept the full TTL', 'a');
    random = 0.999;
    cache.set('lost almost 10%', 'b');
    now = 905;
    expect(cache.get('kept the full TTL')).toBe('a');
    expect(cache.get('lost almost 10%')).toBeUndefined();
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

  describe('stale values', () => {
    // Fresh until 1000, answered at once while refreshing until 2000, usable on errors until 6000.
    function setUp() {
      const clock = { now: 0 };
      const cache = new TtlCache<string>(1000, {
        staleWhileRevalidateMs: 1000,
        staleIfErrorMs: 5000,
        now: () => clock.now,
      });
      cache.set('warsaw', 'old');
      return { clock, cache };
    }
    const settle = () => new Promise((resolve) => setTimeout(resolve));
    const failing = () => Promise.reject(new Error('provider down'));

    it('returns a slightly stale value at once and refreshes it in the background, once', async () => {
      const { clock, cache } = setUp();
      clock.now = 1500;
      let release!: (value: string) => void;
      let loads = 0;
      const load = () => {
        loads += 1;
        return new Promise<string>((resolve) => (release = resolve));
      };

      await expect(cache.load('warsaw', load)).resolves.toEqual({ value: 'old', stale: true });
      await expect(cache.getOrLoad('warsaw', load)).resolves.toBe('old');
      expect(loads).toBe(1);
      expect(cache.get('warsaw')).toBeUndefined(); // stale is not fresh

      release('new');
      await settle();
      await expect(cache.load('warsaw', load)).resolves.toEqual({ value: 'new', stale: false });
      expect(cache.stats()).toMatchObject({ stale: 2, hits: 1, misses: 0 });
    });

    it('keeps the value when the background refresh fails', async () => {
      const { clock, cache } = setUp();
      clock.now = 1500;
      await expect(cache.getOrLoad('warsaw', failing)).resolves.toBe('old');
      await settle();
      expect(cache.stats().refreshErrors).toBe(1);
      await expect(cache.getOrLoad('warsaw', failing)).resolves.toBe('old');
    });

    it('waits for a new value past the revalidate window, as on a miss', async () => {
      const { clock, cache } = setUp();
      clock.now = 3000;
      await expect(cache.load('warsaw', async () => 'new')).resolves.toEqual({ value: 'new', stale: false });
      expect(cache.stats()).toMatchObject({ stale: 0, misses: 1 });
    });

    it('answers with the old value when that load fails, until it is too old', async () => {
      const { clock, cache } = setUp();
      clock.now = 3000;
      await expect(cache.load('warsaw', failing)).resolves.toEqual({ value: 'old', stale: true });
      expect(cache.stats().staleOnError).toBe(1);

      // Joined loads get it too.
      let fail!: (error: Error) => void;
      const slow = () => new Promise<string>((_, reject) => (fail = reject));
      const first = cache.getOrLoad('warsaw', slow);
      const second = cache.getOrLoad('warsaw', slow);
      fail(new Error('provider down'));
      await expect(Promise.all([first, second])).resolves.toEqual(['old', 'old']);

      clock.now = 6000;
      await expect(cache.getOrLoad('warsaw', failing)).rejects.toThrow('provider down');
    });

    it('answers with the old value when the new one is a fallback `keep` refuses', async () => {
      const { clock, cache } = setUp();
      clock.now = 3000;
      const refused = cache.load(
        'warsaw',
        async () => 'fallback',
        (value) => value !== 'fallback',
      );
      await expect(refused).resolves.toEqual({ value: 'old', stale: true });
      // Without an old value the fallback is still the answer.
      await expect(
        cache.getOrLoad(
          'krakow',
          async () => 'fallback',
          (value) => value !== 'fallback',
        ),
      ).resolves.toBe('fallback');
    });

    it('judges the old value by when the request came, not by when the load failed', async () => {
      const { clock, cache } = setUp();
      clock.now = 5900;
      let fail!: (error: Error) => void;
      const answer = cache.getOrLoad('warsaw', () => new Promise<string>((_, reject) => (fail = reject)));
      clock.now = 6100; // the provider's timeout ends past the window
      fail(new Error('timeout'));
      await expect(answer).resolves.toBe('old');
    });

    it('reports each failed load behind a stale value once, not each request', async () => {
      const errors: unknown[] = [];
      let now = 0;
      const cache = new TtlCache<string>(1000, {
        staleWhileRevalidateMs: 1000,
        staleIfErrorMs: 5000,
        now: () => now,
        onStaleError: (err) => errors.push(err),
      });
      // A failure with nothing cached is the caller's error, not reported here.
      await expect(cache.getOrLoad('a', failing)).rejects.toThrow();
      cache.set('a', 'old');
      now = 1500;
      await Promise.all([cache.getOrLoad('a', failing), cache.getOrLoad('a', failing)]);
      await settle();
      now = 3000;
      await Promise.all([cache.getOrLoad('a', failing), cache.getOrLoad('a', failing)]);
      await settle();
      expect(errors).toHaveLength(2);
    });

    it('reports a failure behind an old value even if that entry was evicted during the load', async () => {
      const errors: unknown[] = [];
      let now = 0;
      const cache = new TtlCache<string>(1000, {
        staleIfErrorMs: 5000,
        maxEntries: 1,
        now: () => now,
        onStaleError: (err) => errors.push(err),
      });
      cache.set('a', 'old');
      now = 2000;
      let fail!: (error: Error) => void;
      const answer = cache.getOrLoad('a', () => new Promise<string>((_, reject) => (fail = reject)));
      cache.set('b', 'pushes a out');
      fail(new Error('provider down'));
      await expect(answer).resolves.toBe('old');
      await settle();
      expect(errors).toHaveLength(1);
    });

    it('keeps the stale value when `keep` refuses the refreshed one', async () => {
      const { clock, cache } = setUp();
      clock.now = 1500;
      const fallback = () =>
        cache.getOrLoad(
          'warsaw',
          async () => 'fallback',
          () => false,
        );
      await fallback();
      await settle();
      await expect(fallback()).resolves.toBe('old');
    });
  });
});
