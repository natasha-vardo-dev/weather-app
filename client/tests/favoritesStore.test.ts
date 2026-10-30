import { MAX_FAVORITES, type Favorite } from '@weather/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FAVORITES_KEY, getSnapshot, remove, save } from '../src/favoritesStore';

/** In-memory localStorage: the client tests run in Node, which has none. */
function stubStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
  vi.stubGlobal('localStorage', storage);
  return data;
}

const warsaw: Favorite = { latitude: 52.23, longitude: 21.01, name: 'Warsaw', country: 'Poland', id: 756135 };
const krakow: Favorite = { latitude: 50.06, longitude: 19.94, name: 'Krakow', country: 'Poland' };

let data: Map<string, string>;
const stored = () => JSON.parse(data.get(FAVORITES_KEY) ?? '[]') as Favorite[];

beforeEach(() => {
  data = stubStorage();
});

describe('save', () => {
  it('adds the place with its id', () => {
    save(warsaw);
    expect(stored()).toEqual([warsaw]);
  });

  it('does nothing for a place that is already saved (never removes it)', () => {
    save(warsaw);
    save(warsaw);
    expect(stored()).toHaveLength(1);
  });

  it('does not add to a full list', () => {
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => ({ latitude: i, longitude: 0, name: `P${i}` }));
    data.set(FAVORITES_KEY, JSON.stringify(full));
    save(warsaw);
    expect(stored()).toHaveLength(MAX_FAVORITES);
    expect(stored().some((f) => f.name === 'Warsaw')).toBe(false);
  });
});

describe('remove', () => {
  it('removes the place', () => {
    save(warsaw);
    save(krakow);
    remove(warsaw);
    expect(stored()).toEqual([krakow]);
  });

  it('does nothing for a place that is not saved', () => {
    save(warsaw);
    remove(krakow);
    expect(stored()).toEqual([warsaw]);
  });
});

describe('getSnapshot', () => {
  it('lists the newest saved first', () => {
    save(warsaw);
    save(krakow);
    expect(getSnapshot().map((f) => f.name)).toEqual(['Krakow', 'Warsaw']);
  });

  it('returns the same object while storage is unchanged', () => {
    save(warsaw);
    expect(getSnapshot()).toBe(getSnapshot());
  });

  it('treats corrupted or blocked storage as empty', () => {
    data.set(FAVORITES_KEY, '{not json');
    expect(getSnapshot()).toEqual([]);

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    });
    expect(getSnapshot()).toEqual([]);
    expect(() => save(warsaw)).not.toThrow();
  });
});
