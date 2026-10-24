import { describe, expect, it } from 'vitest';
import { isFavorite, MAX_FAVORITES, parseFavorites, toggleFavorite, type Favorite } from '../src/favorites.js';

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

  it('returns an empty list for anything that is not an array', () => {
    expect(parseFavorites(null)).toEqual([]);
    expect(parseFavorites({ favorites: [] })).toEqual([]);
  });
});
