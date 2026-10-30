import { describe, expect, it } from 'vitest';
import { coordinatesLabel, parsePlace, parsePlaceRoute, placePath, slugify } from '../src/locationUrl';

describe('slugify', () => {
  it('turns names into plain Latin', () => {
    expect(slugify('Kraków')).toBe('krakow');
    expect(slugify('Warszawa')).toBe('warszawa');
    expect(slugify('Łódź')).toBe('lodz');
    expect(slugify('Варшава')).toBe('varshava');
    expect(slugify('Юзефув')).toBe('yuzefuv');
    // One table for Russian and Ukrainian, so "и" is "i" here; the page then swaps in "kyiv".
    expect(slugify('Київ')).toBe('kiyiv');
    expect(slugify('Мойка')).toBe('moyka');
    expect(slugify('Ηράκλειο')).toBe('irakleio');
    expect(slugify('Saint-Rémy-de-Provence')).toBe('saint-remy-de-provence');
    expect(slugify('Frankfurt am Main')).toBe('frankfurt-am-main');
  });

  it('gives nothing for scripts it does not spell out', () => {
    expect(slugify('東京')).toBe('');
    expect(slugify('القاهرة')).toBe('');
  });
});

describe('placePath', () => {
  it('links a place from search by its id, with a readable slug', () => {
    expect(placePath({ latitude: 52.2297, longitude: 21.0122, name: 'Warsaw', country: 'Poland', id: 756135 })).toBe(
      '/weather/756135-warsaw',
    );
    expect(placePath({ latitude: 52.2297, longitude: 21.0122, name: 'Варшава', id: 756135 })).toBe(
      '/weather/756135-varshava',
    );
    expect(placePath({ latitude: 35.69, longitude: 139.69, name: '東京', id: 1850147 })).toBe('/weather/1850147');
  });

  it('links a place without an id by coordinates, name and country riding along', () => {
    expect(placePath({ latitude: 52.2497, longitude: 21.0522, name: 'Warsaw', country: 'Poland' })).toBe(
      '/weather/52.25,21.05?name=Warsaw&country=Poland',
    );
    expect(placePath({ latitude: 50.06, longitude: 19.94, name: 'Kraków' })).toBe('/weather/50.06,19.94?name=Krak%C3%B3w');
  });
});

describe('parsePlaceRoute', () => {
  it('reads an id link, with or without a slug', () => {
    expect(parsePlaceRoute('756135-warsaw', new URLSearchParams())).toEqual({ kind: 'id', id: 756135, slug: 'warsaw' });
    expect(parsePlaceRoute('756135', new URLSearchParams())).toEqual({ kind: 'id', id: 756135, slug: '' });
  });

  it('rejects an id the provider would not accept', () => {
    expect(parsePlaceRoute('0-nowhere', new URLSearchParams())).toBeNull();
    expect(parsePlaceRoute('99999999999-warsaw', new URLSearchParams())).toBeNull();
  });

  it('reads coordinates links, old ones with ?id= included', () => {
    expect(parsePlaceRoute('52.23,21.01', new URLSearchParams('name=Warsaw&id=756135'))).toEqual({
      kind: 'coords',
      place: { latitude: 52.23, longitude: 21.01, name: 'Warsaw', country: undefined, id: 756135 },
    });
  });

  it('opens by the id whatever the slug says (typed by hand, another script)', () => {
    expect(parsePlaceRoute('756135-Warsaw', new URLSearchParams())).toEqual({ kind: 'id', id: 756135, slug: 'Warsaw' });
    expect(parsePlaceRoute('756135-варшава', new URLSearchParams())).toMatchObject({ kind: 'id', id: 756135 });
  });

  it.each(['', 'abc', 'warsaw', '52.23', '1,2,3', '-33.87,151.21x'])('rejects %j', (segment) => {
    expect(parsePlaceRoute(segment, new URLSearchParams())).toBeNull();
  });
});

describe('parsePlace', () => {
  it('round-trips with placePath', () => {
    const path = placePath({ latitude: -33.8688, longitude: 151.2093, name: 'Sydney', country: 'Australia' });
    const [pathname, query] = path.split('?');
    const coords = pathname.replace('/weather/', '');
    expect(parsePlace(coords, new URLSearchParams(query))).toEqual({
      latitude: -33.87,
      longitude: 151.21,
      name: 'Sydney',
      country: 'Australia',
    });
  });

  it('falls back to coordinates as the name', () => {
    expect(parsePlace('52.23,21.01', new URLSearchParams())?.name).toBe('52.23, 21.01');
    // useLocalizedPlace relies on this to skip a pointless name search.
    expect(parsePlace('52.23,21.01', new URLSearchParams())?.name).toBe(coordinatesLabel(52.23, 21.01));
  });

  it.each(['', 'abc', '52.23', '91,0', '0,181', '1,2,3', ',5'])('rejects %j', (coords) => {
    expect(parsePlace(coords, new URLSearchParams())).toBeNull();
  });

  it('carries the id of an older link, ignoring a broken one', () => {
    expect(parsePlace('52.23,21.01', new URLSearchParams('name=Warsaw&id=756135'))?.id).toBe(756135);
    expect(parsePlace('52.23,21.01', new URLSearchParams('name=Warsaw&id=abc'))?.id).toBeUndefined();
    // Larger than a 32-bit id: the provider would reject it.
    expect(parsePlace('52.23,21.01', new URLSearchParams('name=Warsaw&id=99999999999'))?.id).toBeUndefined();
  });
});
