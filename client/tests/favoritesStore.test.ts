import { MAX_FAVORITES, type Favorite } from '@weather/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHome, FAVORITES_KEY, getSnapshot, HOME_KEY, remove, save, setHome } from '../src/favoritesStore';

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
const storedHome = () => (data.has(HOME_KEY) ? (JSON.parse(data.get(HOME_KEY)!) as Favorite) : null);

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

  it('clears the home city when it is the one removed', () => {
    setHome(warsaw);
    remove(warsaw);
    expect(storedHome()).toBeNull();
  });

  it('keeps the home city when another place is removed', () => {
    setHome(warsaw);
    save(krakow);
    remove(krakow);
    expect(storedHome()?.name).toBe('Warsaw');
  });

  it('does nothing for a place that is not saved', () => {
    setHome(warsaw);
    remove(krakow);
    expect(stored()).toHaveLength(1);
    expect(storedHome()?.name).toBe('Warsaw');
  });
});

describe('setHome', () => {
  it('saves the place first, then makes it home', () => {
    setHome(krakow);
    expect(stored()).toEqual([krakow]);
    expect(storedHome()).toEqual(krakow);
  });

  it('writes nothing when the place cannot be saved because the list is full', () => {
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => ({ latitude: i, longitude: 0, name: `P${i}` }));
    data.set(FAVORITES_KEY, JSON.stringify(full));
    setHome(warsaw);
    expect(storedHome()).toBeNull();
    expect(stored()).toHaveLength(MAX_FAVORITES);
  });

  it('works for an already saved place even when the list is full', () => {
    const full = Array.from({ length: MAX_FAVORITES - 1 }, (_, i) => ({ latitude: i, longitude: 0, name: `P${i}` }));
    data.set(FAVORITES_KEY, JSON.stringify([warsaw, ...full]));
    setHome(warsaw);
    expect(storedHome()?.name).toBe('Warsaw');
  });
});

describe('clearHome', () => {
  it('clears the home city and keeps the place saved', () => {
    setHome(warsaw);
    clearHome();
    expect(storedHome()).toBeNull();
    expect(stored()).toHaveLength(1);
  });
});

describe('getSnapshot', () => {
  it('puts the home city first', () => {
    save(warsaw);
    save(krakow); // newest first: Krakow, Warsaw
    setHome(warsaw);
    expect(getSnapshot().favorites.map((f) => f.name)).toEqual(['Warsaw', 'Krakow']);
  });

  it('ignores a stored home city that is not saved any more', () => {
    save(krakow);
    data.set(HOME_KEY, JSON.stringify(warsaw));
    expect(getSnapshot().home).toBeNull();
  });

  it('returns the same object while storage is unchanged', () => {
    save(warsaw);
    expect(getSnapshot()).toBe(getSnapshot());
  });

  it('treats corrupted or blocked storage as empty', () => {
    data.set(FAVORITES_KEY, '{not json');
    expect(getSnapshot().favorites).toEqual([]);

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    });
    expect(getSnapshot().favorites).toEqual([]);
    expect(() => save(warsaw)).not.toThrow();
  });
});
