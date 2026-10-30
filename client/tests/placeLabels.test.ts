import type { Location } from '@weather/shared';
import { describe, expect, it } from 'vitest';
import { describePlaces, distinguishPlaces, placeArea, regionToShow } from '../src/placeLabels';

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

describe('distinguishPlaces', () => {
  const warsaw = { name: 'Warszawa', country: 'Polska', region: 'Województwo mazowieckie', areas: ['Warszawa'] };
  const otwock = { name: 'Józefów', country: 'Polska', region: 'Województwo mazowieckie', areas: ['Powiat otwocki', 'Józefów'] };
  const ozarow = { name: 'Józefów', country: 'Polska', region: 'Województwo mazowieckie', areas: ['Powiat warszawski zachodni', 'Ożarów Mazowiecki'] };
  const bilgoraj = { name: 'Józefów', country: 'Polska', region: 'Województwo lubelskie', areas: ['Powiat biłgorajski', 'Józefów'] };

  it('leaves a name that is not shared alone', () => {
    expect(distinguishPlaces([warsaw, otwock])).toEqual([undefined, undefined]);
  });

  it('gives same-named places the first level at which they differ', () => {
    // The shared "Województwo" is dropped: on a narrow tile both were cut to "Województw…".
    expect(distinguishPlaces([warsaw, otwock, bilgoraj])).toEqual([undefined, 'mazowieckie', 'lubelskie']);
    // Same voivodeship: the district tells them apart.
    expect(distinguishPlaces([otwock, ozarow])).toEqual(['otwocki', 'warszawski zachodni']);
  });

  it('drops shared words at the end too, and keeps a word when one value is a single word', () => {
    const ru = (region: string) => ({ name: 'Юзефув', country: 'Польша', region });
    expect(distinguishPlaces([ru('Мазовецкое воеводство'), ru('Люблинское воеводство')])).toEqual(['Мазовецкое', 'Люблинское']);
    const de = (region: string) => ({ name: 'Neustadt', country: 'Deutschland', region });
    expect(distinguishPlaces([de('Hessen'), de('Rheinland-Pfalz')])).toEqual(['Hessen', 'Rheinland-Pfalz']);
  });

  it('adds nothing when the levels are unknown (still loading or failed)', () => {
    expect(distinguishPlaces([{ name: 'Józefów', country: 'Polska' }, { name: 'Józefów', country: 'Polska' }])).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('tells three namesakes apart, two of them in one voivodeship, each at its own level', () => {
    const otwock = { name: 'Józefów', country: 'Polska', region: 'Województwo mazowieckie', areas: ['Powiat otwocki'] };
    const ozarow = { ...otwock, areas: ['Powiat warszawski zachodni'] };
    const bilgoraj = { name: 'Józefów', country: 'Polska', region: 'Województwo lubelskie', areas: ['Powiat biłgorajski'] };
    expect(distinguishPlaces([otwock, ozarow, bilgoraj])).toEqual(['otwocki', 'warszawski zachodni', 'lubelskie']);
  });

  it('gives nothing while one of the namesakes has no levels yet (loading or failed)', () => {
    const loaded = { name: 'Józefów', country: 'Polska', region: 'Województwo mazowieckie', areas: ['Powiat otwocki'] };
    const loading = { name: 'Józefów', country: 'Polska' };
    expect(distinguishPlaces([loaded, loading])).toEqual([undefined, undefined]);
    expect(
      distinguishPlaces([loaded, loading, { ...loaded, areas: ['Powiat warszawski zachodni'] }]),
    ).toEqual(['otwocki', undefined, 'warszawski zachodni']);
  });
});

describe('regionToShow', () => {
  it('skips a region that repeats the name', () => {
    expect(regionToShow('Берлин', 'Берлин', 'ru')).toBeUndefined();
    expect(regionToShow('Tokyo', 'tokyo', 'en')).toBeUndefined();
  });

  it('skips a region left in Latin letters for a non-Latin interface', () => {
    expect(regionToShow('Родос', 'South Aegean', 'ru')).toBeUndefined();
    expect(regionToShow('Варшава', 'Мазовецкое воеводство', 'ru')).toBe('Мазовецкое воеводство');
    expect(regionToShow('東京', 'Kanagawa', 'ja')).toBeUndefined();
  });

  it('keeps it in Latin-script interfaces, where a fallback cannot be told apart', () => {
    expect(regionToShow('Rodos', 'South Aegean', 'pl')).toBe('South Aegean');
    expect(regionToShow('Józefów', 'Województwo mazowieckie', 'pl')).toBe('Województwo mazowieckie');
  });
});

describe('distinguishPlaces with names spelled differently', () => {
  it('counts places as namesakes when any form of the name matches', () => {
    // In Russian the town is "Юзефув", the village keeps "Józefów" (no Russian name).
    const town = {
      name: 'Юзефув',
      aliases: ['Józefów'],
      country: 'Польша',
      region: 'Мазовецкое воеводство',
      areas: ['Powiat otwocki', 'Józefów'],
    };
    const village = {
      name: 'Józefów',
      aliases: ['Józefów'],
      country: 'Польша',
      region: 'Мазовецкое воеводство',
      areas: ['Powiat warszawski zachodni', 'Ожарув-Мазовецкий'],
    };
    expect(distinguishPlaces([town, village])).toEqual(['otwocki', 'warszawski zachodni']);
  });
});

describe('placeArea', () => {
  it('gives district and region, the district even untranslated', () => {
    expect(
      placeArea({ name: 'Юзефув', region: 'Мазовецкое воеводство', areas: ['Powiat otwocki', 'Józefów'] }, 'ru'),
    ).toEqual(['Powiat otwocki', 'Мазовецкое воеводство']);
  });

  it('leaves out a district that is the city itself', () => {
    expect(placeArea({ name: 'Варшава', region: 'Мазовецкое воеводство', areas: ['Warszawa', 'Warszawa'] }, 'ru')).toEqual(['Мазовецкое воеводство']);
    expect(placeArea({ name: 'Краков', region: 'Малопольское воеводство', areas: ['Краков', 'Kraków'] }, 'ru')).toEqual(['Малопольское воеводство']);
    expect(placeArea({ name: 'Париж', region: 'Иль-де-Франс', areas: ['Paris', 'Paris', 'Paris'] }, 'ru')).toEqual(['Иль-де-Франс']);
  });

  it('knows the district is the city in another spelling (English names, local districts)', () => {
    expect(placeArea({ name: 'Warsaw', region: 'Mazovia', areas: ['Warszawa', 'Warsaw'] }, 'en')).toEqual(['Mazovia']);
    expect(placeArea({ name: 'Poznan', region: 'Greater Poland', areas: ['Poznań', 'Poznań'] }, 'en')).toEqual([
      'Greater Poland',
    ]);
    // A real district stays, even when the town has the same name as the level below.
    expect(placeArea({ name: 'Józefów', region: 'Masovia', areas: ['Powiat otwocki', 'Józefów'] }, 'en')).toEqual([
      'Powiat otwocki',
      'Masovia',
    ]);
  });

  it('is nothing when there is nothing to add (Berlin is its own region, no districts)', () => {
    expect(placeArea({ name: 'Берлин', region: 'Берлин', areas: ['', 'Berlin, Stadt', 'Berlin'] }, 'ru')).toEqual([]);
    expect(placeArea({ name: 'New York', region: 'New York' }, 'en')).toEqual([]);
  });

  it('drops an untranslated region but keeps the district', () => {
    expect(placeArea({ name: 'Родос', region: 'South Aegean', areas: ['Dodecanese', 'Dimos Rhodes'] }, 'ru')).toEqual(['Dodecanese']);
  });
});
