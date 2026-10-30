import { describe, expect, it } from 'vitest';
import {
  findSavedCity,
  isFavorite,
  MAX_FAVORITES,
  parseFavorites,
  toggleFavorite,
  type Favorite,
} from '../src/favorites.js';

const warsaw: Favorite = { latitude: 52.23, longitude: 21.01, name: 'Warsaw', country: 'Poland' };
const london: Favorite = { latitude: 51.51, longitude: -0.13, name: 'London' };

describe('toggleFavorite', () => {
  it('adds new places at the top and removes saved ones', () => {
    const one = toggleFavorite([], warsaw);
    const two = toggleFavorite(one, london);
    expect(two.map((f) => f.name)).toEqual(['London', 'Warsaw']);
    expect(toggleFavorite(two, warsaw).map((f) => f.name)).toEqual(['London']);
  });

  it('treats nearby coordinates (~1 km) as the same place', () => {
    const saved = toggleFavorite([], warsaw);
    const sameCity = { ...warsaw, latitude: 52.2297, longitude: 21.0122, name: 'Варшава' };
    expect(isFavorite(saved, sameCity)).toBe(true);
    expect(toggleFavorite(saved, sameCity)).toEqual([]);
  });

  it('does not add to a full list', () => {
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => ({ ...london, latitude: i }));
    expect(toggleFavorite(full, warsaw)).toEqual(full);
  });
});

describe('parseFavorites', () => {
  it('keeps valid entries and drops broken ones and duplicates', () => {
    const raw = [
      warsaw,
      { ...warsaw, name: 'Warsaw again' },
      { latitude: 200, longitude: 0, name: 'Nowhere' },
      { latitude: '1', longitude: 2, name: 'Strings' },
      { latitude: 1, longitude: 2, name: '  ' },
      null,
      'London',
      { ...london, country: '' },
    ];
    expect(parseFavorites(raw)).toEqual([warsaw, london]);
  });

  it('keeps a valid provider id and drops a broken one', () => {
    expect(parseFavorites([{ ...warsaw, id: 756135 }])[0].id).toBe(756135);
    expect(parseFavorites([{ ...warsaw, id: '756135' }])[0].id).toBeUndefined();
    expect(parseFavorites([{ ...warsaw, id: -1 }])[0].id).toBeUndefined();
    expect(parseFavorites([{ ...warsaw, id: 2_147_483_648 }])[0].id).toBeUndefined();
    expect(toggleFavorite([], { ...warsaw, id: 756135 })[0].id).toBe(756135);
  });

  it('returns an empty list for anything that is not an array', () => {
    expect(parseFavorites(null)).toEqual([]);
    expect(parseFavorites({ favorites: [] })).toEqual([]);
  });
});

describe('findSavedCity', () => {
  const savedWarsaw: Favorite = { latitude: 52.23, longitude: 21.01, name: 'Warsaw', country: 'Poland', id: 756135 };
  const krakow: Favorite = { latitude: 50.06, longitude: 19.94, name: 'Krakow', country: 'Poland' };
  // The user's own ~1 km cell in Warsaw, ~4 km from the centre a saved city has.
  const here = { latitude: 52.25, longitude: 21.05 };

  it('finds the saved city by name nearby: the duplicate Warsaw bug', () => {
    expect(findSavedCity([krakow, savedWarsaw], { ...here, name: 'Warsaw' })).toBe(savedWarsaw);
    expect(findSavedCity([savedWarsaw], { ...here, name: ' warsaw ' })).toBe(savedWarsaw);
  });

  it('finds it by provider id or by the same coordinates', () => {
    expect(findSavedCity([savedWarsaw], { ...here, name: 'Варшава', id: 756135 })).toBe(savedWarsaw);
    expect(findSavedCity([savedWarsaw], { latitude: 52.23, longitude: 21.01, name: 'Варшава' })).toBe(savedWarsaw);
  });

  it('does not match a namesake far away, or another town nearby', () => {
    const indiana = { latitude: 41.24, longitude: -85.85, name: 'Warsaw' };
    expect(findSavedCity([savedWarsaw], indiana)).toBeNull();
    expect(findSavedCity([savedWarsaw], { latitude: 52.2, longitude: 20.97, name: 'Piastów' })).toBeNull();
  });

  it('prefers the nearest of two saved places with the same name', () => {
    const otherWarsaw: Favorite = { latitude: 52.4, longitude: 21.2, name: 'Warsaw' };
    expect(findSavedCity([otherWarsaw, savedWarsaw], { ...here, name: 'Warsaw' })).toBe(savedWarsaw);
  });
});
