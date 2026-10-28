import { readFileSync } from 'node:fs';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { ProviderError } from '../src/errors.js';
import { MeteoAlarmProvider, parseCap, parseCapPolygon, parseFeed } from '../src/providers/meteoAlarm.js';
import type { AlertsProvider, ProviderAlert } from '../src/providers/types.js';
import { AlertService, pickText } from '../src/services/alertService.js';
import { cellKey, polygonContains, polygonsNear, RegionIndex, type Region } from '../src/services/regions.js';
import { WeatherService } from '../src/services/weatherService.js';
import { createFakeProvider } from './fakeProvider.js';

// Real MeteoAlarm answers from 27 Oct 2026, trimmed to a few entries.
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const polandFeed = fixture('meteoalarm-poland.atom');
const norwayFeed = fixture('meteoalarm-norway.atom');
const fogCap = fixture('cap-poland-fog.xml');
const windCap = fixture('cap-poland-wind.xml');
const galeCap = fixture('cap-norway-gale.xml');

/** Midday on 27 Oct: the fog warnings are announced for the evening, the coastal wind one has expired. */
const NOW = Date.parse('2026-10-27T12:00:00Z');

/** A square region around a point, ~±0.1°. */
function square(code: string, lat: number, lon: number): Region {
  const ring: [number, number][] = [
    [lon - 0.1, lat - 0.1],
    [lon + 0.1, lat - 0.1],
    [lon + 0.1, lat + 0.1],
    [lon - 0.1, lat + 0.1],
    [lon - 0.1, lat - 0.1],
  ];
  return { code, country: code.slice(0, 2), name: code, bbox: [lon - 0.1, lat - 0.1, lon + 0.1, lat + 0.1], polygons: [[ring]] };
}

// Węgorzewo county (PL2819) with fog in the fixture; the central coastal zone (PL804) with expired wind.
const WEGORZEWO = { lat: 54.21, lon: 21.74 };
const COAST = { lat: 54.6, lon: 17.0 };
const regions = new RegionIndex([square('PL2819', WEGORZEWO.lat, WEGORZEWO.lon), square('PL804', COAST.lat, COAST.lon)]);

function fakeFetch(overrides: Record<string, () => Response> = {}) {
  return vi.fn(async (url: string | URL) => {
    const href = String(url);
    for (const [part, respond] of Object.entries(overrides)) if (href.includes(part)) return respond();
    if (href.endsWith('legacy-atom-poland')) return new Response(polandFeed);
    if (href.endsWith('legacy-atom-norway')) return new Response(norwayFeed);
    if (href.includes('6b0b72c3')) return new Response(fogCap);
    if (href.includes('38bea1ea')) return new Response(windCap);
    if (href.includes('feeds-norway')) return new Response(galeCap);
    if (href.includes('legacy-atom-')) return new Response('<feed xmlns="http://www.w3.org/2005/Atom"></feed>');
    return new Response('not found', { status: 404 });
  });
}

function provider(fetchFn = fakeFetch(), now = () => NOW, index = regions) {
  return new MeteoAlarmProvider({
    regions: async () => index,
    feedTtlMs: 4 * 60 * 1000,
    fetchFn: fetchFn as unknown as typeof fetch,
    now,
  });
}

describe('region geometry', () => {
  const ring: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const hole: [number, number][] = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];

  it('tells inside from outside, holes included', () => {
    expect(polygonContains([ring, hole], [2, 2])).toBe(true);
    expect(polygonContains([ring, hole], [5, 5])).toBe(false);
    expect(polygonContains([ring, hole], [12, 5])).toBe(false);
  });

  it('counts a place just outside a border as near (rounded places, simplified borders)', () => {
    const county: [number, number][] = [[21, 54], [21.5, 54], [21.5, 54.5], [21, 54.5], [21, 54]];
    expect(polygonsNear([[county]], [21.51, 54.25], 1.5)).toBe(true); // ~650 m east
    expect(polygonsNear([[county]], [21.6, 54.25], 1.5)).toBe(false); // ~6.5 km east
  });
});

describe('MeteoAlarm parsing', () => {
  it('reads each area of a warning with its region codes and full-warning link', () => {
    const entries = parseFeed(polandFeed);
    expect(entries.map((e) => e.regions)).toEqual([['PL2819'], ['PL2818'], ['PL804']]);
    expect(entries[0]).toMatchObject({
      capUrl: 'https://feeds.meteoalarm.org/api/v1/warnings/feeds-poland/6b0b72c3-75cd-4dd2-945e-64329ac98c9e',
      status: 'Actual',
      severity: 'Moderate',
      expires: '2026-10-28T09:00:00+00:00',
      polygons: [],
    });
  });

  it('reads drawn areas, turning CAP "lat,lon" into GeoJSON [lon, lat]', () => {
    const [entry] = parseFeed(norwayFeed);
    expect(entry!.regions).toEqual([]);
    expect(entry!.polygons[0]![0]![0]).toEqual([9.4457, 64.1828]);
    expect(parseCapPolygon('1,2 3,4')).toBeNull(); // not a closed ring
  });

  it('falls back for a missing start: effective, then the feed, then sent', () => {
    const entry = { severity: 'Moderate', event: '', onset: '', expires: '' };
    const noOnset = fogCap.replace(/<onset>.*?<\/onset>/g, '');
    expect(parseCap(noOnset, entry)!.onset).toBe('2026-10-27T11:22:00+01:00'); // effective
    const noOnsetNorEffective = noOnset.replace(/<effective>.*?<\/effective>/g, '');
    expect(parseCap(noOnsetNorEffective, { ...entry, onset: '2026-10-27T10:00:00Z' })!.onset).toBe('2026-10-27T10:00:00Z');
    expect(parseCap(noOnsetNorEffective, entry)!.onset).toBe('2026-10-27T11:22:00+01:00'); // sent
  });

  it('reads level, type, every language and the warning it updates', () => {
    const alert = parseCap(windCap, { severity: 'Moderate', event: '', onset: '', expires: '' })!;
    expect(alert).toMatchObject({ level: 'yellow', type: 'wind', expires: '2026-10-26T18:00:00+01:00' });
    expect(alert.texts.map((t) => t.language)).toEqual(['pl-PL', 'en-GB']);
    expect(alert.texts[1]).toMatchObject({ event: 'Yellow Wind warning', sender: expect.stringContaining('IMGW-PIB') });
    expect(alert.replaces).toEqual(['2.49.0.0.616.0.PL.261025233625.PL804_01421']);
  });
});

describe('MeteoAlarmProvider', () => {
  it('finds the warnings of the region the place is in', async () => {
    const alerts = await provider().getAlerts(WEGORZEWO.lat, WEGORZEWO.lon);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: 'yellow', type: 'fog', id: '2.49.0.0.616.0.PL.Sk20261027102244306.PL2819' });
  });

  it('reaches a seaside town that coarse coasts put "in the sea", only when no region is near', async () => {
    // ~3.3 km beyond the Węgorzewo square: too far for NEAR_REGION_KM, within the fallback.
    const offshore = { lat: WEGORZEWO.lat + 0.13, lon: WEGORZEWO.lon };
    expect(await provider().getAlerts(offshore.lat, offshore.lon)).toHaveLength(1);

    // With another region right there, the farther one is not added.
    const withNeighbour = new RegionIndex([
      square('PL2819', WEGORZEWO.lat, WEGORZEWO.lon),
      square('PL2818', offshore.lat + 0.105, offshore.lon),
    ]);
    const alerts = await provider(fakeFetch(), () => NOW, withNeighbour).getAlerts(offshore.lat, offshore.lon);
    expect(alerts.map((a) => a.id)).not.toContain('2.49.0.0.616.0.PL.Sk20261027102244306.PL2819');
    expect(alerts).toHaveLength(1);
  });

  it('leaves out expired warnings still listed in the feed', async () => {
    expect(await provider().getAlerts(COAST.lat, COAST.lon)).toEqual([]);
  });

  it('matches drawn areas of countries without region codes', async () => {
    const alerts = await provider().getAlerts(64.1828, 9.4457);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: 'wind', level: 'yellow' });
    expect(await provider().getAlerts(59.91, 10.75)).toEqual([]); // Oslo: same feed, another area
  });

  it('answers nothing, without requests, outside the covered countries', async () => {
    const fetchFn = fakeFetch();
    expect(await provider(fetchFn).getAlerts(40.71, -74.01)).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('reads a country feed once per TTL for all places in it', async () => {
    const fetchFn = fakeFetch();
    const p = provider(fetchFn);
    await Promise.all([p.getAlerts(WEGORZEWO.lat, WEGORZEWO.lon), p.getAlerts(WEGORZEWO.lat, WEGORZEWO.lon)]);
    await p.getAlerts(COAST.lat, COAST.lon);
    const feedCalls = fetchFn.mock.calls.filter(([url]) => String(url).endsWith('legacy-atom-poland'));
    expect(feedCalls).toHaveLength(1);
  });

  it('does not keep a failed feed: the next request tries again', async () => {
    let fail = true;
    const fetchFn = fakeFetch({ 'legacy-atom-poland': () => (fail ? new Response('down', { status: 503 }) : new Response(polandFeed)) });
    const p = provider(fetchFn);
    await expect(p.getAlerts(WEGORZEWO.lat, WEGORZEWO.lon)).rejects.toBeInstanceOf(ProviderError);
    fail = false;
    expect(await p.getAlerts(WEGORZEWO.lat, WEGORZEWO.lon)).toHaveLength(1);
  });

  describe('when a feed fails', () => {
    // Helsinki is in a Finnish region, and also inside the rough box used to find Norway.
    const HELSINKI = { lat: 60.17, lon: 24.94 };
    const withFinland = new RegionIndex([square('FI001', HELSINKI.lat, HELSINKI.lon)]);
    const down = () => new Response('down', { status: 503 });

    it("ignores a neighbour's feed pulled in only by its rough box", async () => {
      const fetchFn = fakeFetch({ 'legacy-atom-norway': down });
      expect(await provider(fetchFn, () => NOW, withFinland).getAlerts(HELSINKI.lat, HELSINKI.lon)).toEqual([]);
    });

    it("fails when the place's own country feed fails", async () => {
      const fetchFn = fakeFetch({ 'legacy-atom-finland': down });
      await expect(provider(fetchFn, () => NOW, withFinland).getAlerts(HELSINKI.lat, HELSINKI.lon)).rejects.toBeInstanceOf(
        ProviderError,
      );
    });

    it('fails for a border town whose own feed is only guessed, though a neighbour is near', async () => {
      // Kreuzlingen (Switzerland), ~550 m south of a German region.
      const KREUZLINGEN = { lat: 47.65, lon: 9.17 };
      const nearGermany = new RegionIndex([square('DE001', KREUZLINGEN.lat + 0.105, KREUZLINGEN.lon)]);
      const fetchFn = fakeFetch({ 'legacy-atom-switzerland': down });
      await expect(
        provider(fetchFn, () => NOW, nearGermany).getAlerts(KREUZLINGEN.lat, KREUZLINGEN.lon),
      ).rejects.toBeInstanceOf(ProviderError);
    });

    it('also fails when rounding puts the border town just inside the neighbour', async () => {
      // ~550 m inside the German square: closer to the border than rounding can tell apart.
      const TOWN = { lat: 47.65, lon: 9.17 };
      const justInsideGermany = new RegionIndex([square('DE001', TOWN.lat + 0.095, TOWN.lon)]);
      const fetchFn = fakeFetch({ 'legacy-atom-switzerland': down });
      await expect(
        provider(fetchFn, () => NOW, justInsideGermany).getAlerts(TOWN.lat, TOWN.lon),
      ).rejects.toBeInstanceOf(ProviderError);
    });

    it('fails when the place is known only by boxes and one of them fails', async () => {
      const fetchFn = fakeFetch({ 'legacy-atom-norway': down });
      await expect(provider(fetchFn).getAlerts(59.91, 10.75)).rejects.toBeInstanceOf(ProviderError); // Oslo
    });
  });

  it('still shows a warning whose full text failed to load, from the feed summary', async () => {
    const fetchFn = fakeFetch({ '6b0b72c3': () => new Response('down', { status: 500 }) });
    const [alert] = await provider(fetchFn).getAlerts(WEGORZEWO.lat, WEGORZEWO.lon);
    expect(alert).toMatchObject({ level: 'yellow', type: 'other', texts: [{ language: 'en', event: 'Yellow Fog warning' }] });
  });
});

describe('MeteoAlarmProvider for push', () => {
  it('names a place\'s areas: its regions, plus its grid cell where countries draw areas', async () => {
    expect(await provider().areasAt(WEGORZEWO.lat, WEGORZEWO.lon)).toEqual(['PL2819']);
    expect(await provider().areasAt(59.91, 10.75)).toEqual([cellKey(59.91, 10.75)]); // Oslo
  });

  it('covers places in a region or a drawing country, not beyond (no bell in Minsk)', async () => {
    expect(await provider().covers(WEGORZEWO.lat, WEGORZEWO.lon)).toBe(true);
    expect(await provider().covers(59.91, 10.75)).toBe(true); // Oslo
    expect(await provider().covers(53.9, 27.57)).toBe(false); // Minsk
    expect(await provider().covers(40.71, -74.0)).toBe(false); // New York
  });

  it('loads a listed warning with its feed entry, sharing one parsed version with the page', async () => {
    // The issuer left <expires> out of the full warning: the feed's time must fill it in,
    // or the page, reading the same cached CAP, would treat the fog warning as expired.
    const noExpiry = fogCap.replace(/<expires>[^<]*<\/expires>/g, '');
    const p = provider(fakeFetch({ '6b0b72c3': () => new Response(noExpiry) }));
    const fog = (await p.listWarnings()).warnings.find((w) => w.ref.includes('6b0b72c3'))!;
    expect((await p.loadWarning(fog.ref))?.expires).toBe('2026-10-28T09:00:00+00:00');
    expect((await p.getAlerts(WEGORZEWO.lat, WEGORZEWO.lon)).map((a) => a.type)).toEqual(['fog']);
    expect(await p.loadWarning('https://example.org/not-listed')).toBeNull();
  });

  it('lists every current warning once, with the areas of all its entries', async () => {
    const { warnings, read } = await provider().listWarnings();
    expect(read).toContain('PL');
    const fog = warnings.find((w) => w.ref.includes('6b0b72c3'));
    expect(fog).toMatchObject({ areas: ['PL2819'], expires: '2026-10-28T09:00:00+00:00' });
    // The coastal wind warning has expired; the Norwegian gale is listed by grid cells.
    expect(warnings.some((w) => w.ref.includes('38bea1ea'))).toBe(false);
    const gale = warnings.find((w) => w.ref.includes('feeds-norway'))!;
    expect(gale.areas.every((area) => area.startsWith('c'))).toBe(true);
    expect(gale.areas).toContain(cellKey(64.1828, 9.4457));
  });
});

describe('AlertService', () => {
  const texts = [
    { language: 'pl-PL', event: 'Żółty alert' },
    { language: 'en-GB', event: 'Yellow warning' },
  ];

  it('picks the user language by its base, else English', () => {
    expect(pickText(texts, 'pl')?.event).toBe('Żółty alert');
    expect(pickText(texts, 'ru')?.event).toBe('Yellow warning');
    expect(pickText([{ language: 'no', event: 'Kuling' }], 'ru')?.event).toBe('Kuling');
  });

  it('shows a warning with an unreadable start as in force now (untrusted input)', async () => {
    const fake: AlertsProvider = {
      attribution: { name: 'Source', url: 'https://example.org' },
      getAlerts: async () => [
        { id: 'x', level: 'yellow', type: 'fog', onset: '', expires: '2026-10-28T00:00:00Z', texts },
      ],
      covers: async () => true,
    };
    const [alert] = (await new AlertService(fake, () => NOW).getAlerts(54, 21, 'en')).alerts;
    expect(alert!.onset).toBe(new Date(NOW).toISOString());
  });

  it('sorts by severity, drops expired ones and credits the source only when there are warnings', async () => {
    const alert = (id: string, level: ProviderAlert['level'], expires: string): ProviderAlert => ({
      id, level, type: 'wind', onset: '2026-10-27T10:00:00Z', expires, texts,
    });
    const fake: AlertsProvider = {
      attribution: { name: 'Source', url: 'https://example.org' },
      getAlerts: vi.fn(async () => [
        alert('a', 'yellow', '2026-10-28T00:00:00Z'),
        alert('b', 'red', '2026-10-28T00:00:00Z'),
        alert('c', 'orange', '2026-10-27T11:00:00Z'),
      ]),
      covers: async () => true,
    };
    const result = await new AlertService(fake, () => NOW).getAlerts(54, 21, 'pl');
    expect(result.alerts.map((a) => [a.id, a.event])).toEqual([['b', 'Żółty alert'], ['a', 'Żółty alert']]);
    expect(result.attribution).toEqual(fake.attribution);

    const none = await new AlertService({ ...fake, getAlerts: async () => [] }, () => NOW).getAlerts(54, 21, 'pl');
    expect(none).toEqual({ alerts: [], attribution: null, covered: true });
    const outside = { ...fake, getAlerts: async () => [], covers: async () => false };
    expect((await new AlertService(outside, () => NOW).getAlerts(53.9, 27.57, 'pl')).covered).toBe(false);
  });
});

describe('GET /api/alerts', () => {
  function app(alerts: AlertsProvider) {
    return createApp(new WeatherService(createFakeProvider()), [], undefined, undefined, false, new AlertService(alerts, () => NOW));
  }

  it('returns warnings for a place, cached briefly (delivery deadlines)', async () => {
    const res = await request(app(provider())).get(`/api/alerts?lat=${WEGORZEWO.lat}&lon=${WEGORZEWO.lon}&lang=pl`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    expect(res.body.alerts[0]).toMatchObject({ level: 'yellow', type: 'fog', language: 'pl-PL' });
    expect(res.body.attribution.name).toBe('EUMETNET – MeteoAlarm');
    expect(res.body.covered).toBe(true);
  });

  it('validates coordinates', async () => {
    const res = await request(app(provider())).get('/api/alerts?lat=100&lon=21');
    expect(res.status).toBe(400);
  });

  it('answers 502 without caching when the source fails', async () => {
    const failing: AlertsProvider = {
      attribution: { name: 'x', url: 'https://example.org' },
      getAlerts: async () => {
        throw new ProviderError('HTTP 503');
      },
      covers: async () => true,
    };
    const res = await request(app(failing)).get('/api/alerts?lat=54&lon=21');
    expect(res.status).toBe(502);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
