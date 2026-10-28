import type { Location } from '@weather/shared';
import { describe, expect, it } from 'vitest';
import { describePlaces } from '../src/placeLabels';

const place = (name: string, extra: Partial<Location> = {}): Location => ({
  id: Math.random(),
  name,
  country: 'Belgium',
  region: 'Flanders',
  latitude: 50.9,
  longitude: 5,
  ...extra,
});

describe('describePlaces', () => {
  it('adds the first level at which twins differ, and only to twins', () => {
    // Open-Meteo's answer for "rhod", trimmed.
    expect(
      describePlaces([
        place('Rode', { areas: ['Flemish Brabant Province', 'Arrondissement of Leuven', 'Geetbets'] }),
        place('Rode', { areas: ['Flemish Brabant Province', 'Arrondissement of Leuven', 'Glabbeek'] }),
        place('Rhode', { region: 'Leinster', country: 'Ireland', areas: ['County Offaly'] }),
      ]),
    ).toEqual(['Geetbets, Flanders, Belgium', 'Glabbeek, Flanders, Belgium', 'Leinster, Ireland']);
  });

  it('uses the most general level that differs', () => {
    expect(
      describePlaces([
        place('Nowa Wieś', { region: 'mazowieckie', country: 'Polska', areas: ['płoński', 'Baboszewo'] }),
        place('Nowa Wieś', { region: 'mazowieckie', country: 'Polska', areas: ['ostrołęcki', 'Lelis'] }),
      ]),
    ).toEqual(['płoński, mazowieckie, Polska', 'ostrołęcki, mazowieckie, Polska']);
  });

  it('leaves real duplicates as they are', () => {
    const same = { areas: ['Flemish Brabant Province'] };
    expect(describePlaces([place('Rode', same), place('Rode', same)])).toEqual(['Flanders, Belgium', 'Flanders, Belgium']);
  });

  it('leaves a town and an island of one name apart by kind', () => {
    const rhodes = { region: 'South Aegean', country: 'Greece', areas: ['Dodecanese'] };
    expect(describePlaces([place('Rhodes', rhodes), place('Rhodes', { ...rhodes, kind: 'island' })])).toEqual([
      'South Aegean, Greece',
      'South Aegean, Greece',
    ]);
  });
});
