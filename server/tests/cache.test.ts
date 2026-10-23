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
});
