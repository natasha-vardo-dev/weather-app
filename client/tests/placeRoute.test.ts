import type { Favorite, Location } from '@weather/shared';
import { describe, expect, it } from 'vitest';
import type { PlaceRoute } from '../src/locationUrl';
import { resolveRoute, type RouteLookups } from '../src/placeRoute';

const warsawEn: Location = { id: 756135, name: 'Warsaw', country: 'Poland', latitude: 52.22977, longitude: 21.01178 };
const warsawRu: Location = { ...warsawEn, name: 'Варшава', country: 'Польша' };
const byId: PlaceRoute = { kind: 'id', id: 756135, slug: 'varshava' };
const none: RouteLookups = { favorites: [], local: undefined, english: undefined, previous: undefined, failed: null };

describe('resolveRoute, an id link', () => {
  it('opens a saved city at once, before any lookup', () => {
    const saved: Favorite = { id: 756135, latitude: 52.23, longitude: 21.01, name: 'Варшава', country: 'Польша' };
    const { state, canonical } = resolveRoute(byId, { ...none, favorites: [saved] });
    expect(state).toEqual({ status: 'ready', place: { ...saved } });
    expect(canonical).toBeNull(); // no English name yet
  });

  it('waits for the lookup, then uses it and gives the canonical link', () => {
    expect(resolveRoute(byId, none).state).toEqual({ status: 'loading' });
    const { state, canonical } = resolveRoute(byId, { ...none, local: warsawRu, english: warsawEn });
    expect(state).toEqual({
      status: 'ready',
      place: { latitude: 52.23, longitude: 21.01, name: 'Варшава', country: 'Польша', id: 756135 },
    });
    expect(canonical).toBe('/weather/756135-warsaw');
  });

  it('keeps the place while another language is looked up, or fails to be (offline)', () => {
    // Switched language: the new lookup is not there, the English one is.
    expect(resolveRoute(byId, { ...none, english: warsawEn, failed: 'NETWORK_ERROR' }).state.status).toBe('ready');
    // Neither is cached any more, but the page had the place.
    const previous = { latitude: 52.23, longitude: 21.01, name: 'Warsaw', id: 756135 };
    expect(resolveRoute(byId, { ...none, previous, failed: 'NETWORK_ERROR' }).state).toEqual({ status: 'ready', place: previous });
    // A previous place of another id does not count.
    expect(resolveRoute(byId, { ...none, previous: { ...previous, id: 1 }, failed: 'NETWORK_ERROR' }).state).toEqual({ status: 'error', code: 'NETWORK_ERROR' });
  });

  it('is "not found" for an unknown id, and an error when nothing is known and the lookup failed', () => {
    expect(resolveRoute(byId, { ...none, local: null }).state).toEqual({ status: 'not-found' });
    expect(resolveRoute(byId, { ...none, failed: 'NETWORK_ERROR' }).state).toEqual({ status: 'error', code: 'NETWORK_ERROR' });
  });
});

describe('resolveRoute, a coordinates link', () => {
  const old: PlaceRoute = {
    kind: 'coords',
    place: { latitude: 52.23, longitude: 21.01, name: 'Варшава', country: 'Польша', id: 756135 },
  };

  it('is ready at once, and moves to the id link once the id is confirmed at these coordinates', () => {
    expect(resolveRoute(old, none)).toEqual({ state: { status: 'ready', place: old.place }, canonical: null });
    expect(resolveRoute(old, { ...none, local: warsawRu, english: warsawEn }).canonical).toBe('/weather/756135-warsaw');
  });

  it('keeps the coordinates of an edited link whose id is somewhere else', () => {
    const edited: PlaceRoute = { kind: 'coords', place: { ...old.place, latitude: 50.06, longitude: 19.94 } };
    expect(resolveRoute(edited, { ...none, local: warsawRu, english: warsawEn }).canonical).toBeNull();
  });
});

it('resolveRoute: no route is an invalid link', () => {
  expect(resolveRoute(null, none).state).toEqual({ status: 'invalid' });
});
