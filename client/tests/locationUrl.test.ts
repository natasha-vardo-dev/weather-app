import { describe, expect, it } from 'vitest';
import { coordinatesLabel, parsePlace, placePath } from '../src/locationUrl';

describe('placePath', () => {
  it('rounds coordinates and encodes display info', () => {
    expect(placePath({ latitude: 52.2297, longitude: 21.0122, name: 'Warsaw', country: 'Poland' })).toBe(
      '/weather/52.23,21.01?name=Warsaw&country=Poland',
    );
  });

  it('encodes non-ASCII names', () => {
    expect(placePath({ latitude: 50.06, longitude: 19.94, name: 'Kraków' })).toBe(
      '/weather/50.06,19.94?name=Krak%C3%B3w',
    );
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

  it('carries the provider id, ignoring a broken one', () => {
    expect(placePath({ latitude: 52.2297, longitude: 21.0122, name: 'Warsaw', id: 756135 })).toBe(
      '/weather/52.23,21.01?name=Warsaw&id=756135',
    );
    expect(parsePlace('52.23,21.01', new URLSearchParams('name=Warsaw&id=756135'))?.id).toBe(756135);
    expect(parsePlace('52.23,21.01', new URLSearchParams('name=Warsaw&id=abc'))?.id).toBeUndefined();
    // Larger than a 32-bit id: the provider would reject it.
    expect(parsePlace('52.23,21.01', new URLSearchParams('name=Warsaw&id=99999999999'))?.id).toBeUndefined();
  });
});
