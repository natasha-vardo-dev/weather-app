import { ALERT_LEVELS, ALERT_TYPES, type AlertLevel, type AlertType } from '@weather/shared';
import { XMLParser } from 'fast-xml-parser';
import { ProviderError } from '../errors.js';
import { TtlCache } from '../services/cache.js';
import {
  bboxContains,
  COAST_FALLBACK_KM,
  NEAR_REGION_KM,
  polygonsNear,
  type BBox,
  type Point,
  type Polygon,
  type RegionIndex,
} from '../services/regions.js';
import type { AlertText, AlertsProvider, ProviderAlert } from './types.js';

const FEED_URL = 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-';

/** ISO 3166-1 code → MeteoAlarm feed name. */
const FEEDS: Record<string, string> = {
  AD: 'andorra', AT: 'austria', BA: 'bosnia-herzegovina', BE: 'belgium', BG: 'bulgaria',
  CH: 'switzerland', CY: 'cyprus', CZ: 'czechia', DE: 'germany', DK: 'denmark',
  EE: 'estonia', ES: 'spain', FI: 'finland', FR: 'france', GB: 'united-kingdom',
  GR: 'greece', HR: 'croatia', HU: 'hungary', IE: 'ireland', IL: 'israel',
  IS: 'iceland', IT: 'italy', LT: 'lithuania', LU: 'luxembourg', LV: 'latvia',
  MD: 'moldova', ME: 'montenegro', MK: 'republic-of-north-macedonia', MT: 'malta', NL: 'netherlands',
  NO: 'norway', PL: 'poland', PT: 'portugal', RO: 'romania', RS: 'serbia',
  SE: 'sweden', SI: 'slovenia', SK: 'slovakia', UA: 'ukraine',
};

/**
 * Countries whose warnings carry their own polygons instead of region codes, so the
 * region file has no borders for them. Their feeds are read when the place is inside these
 * rough boxes (generous: a neighbour's feed read in vain costs one cached request);
 * the warning's polygon then decides precisely.
 */
const POLYGON_COUNTRIES: Record<string, BBox> = {
  AD: [1.4, 42.4, 1.8, 42.7],
  CH: [5.9, 45.8, 10.5, 47.9],
  EE: [21.7, 57.5, 28.3, 59.9],
  GB: [-8.7, 49.8, 1.8, 60.9],
  IL: [34.2, 29.4, 35.9, 33.4],
  LU: [5.7, 49.4, 6.6, 50.2],
  NO: [4, 57.9, 31.2, 71.3],
  SE: [10.9, 55.3, 24.2, 69.1],
  UA: [22.1, 44.3, 40.3, 52.4],
};

/** One area of a warning as the Atom feed lists it (a warning covering 5 counties = 5 entries). */
export interface FeedEntry {
  /** URL of the full warning (CAP XML): the same for all areas of one warning. */
  capUrl: string;
  status: string;
  messageType: string;
  severity: string;
  event: string;
  onset: string;
  expires: string;
  /** EMMA_IDs of the area, for countries that use region codes. */
  regions: string[];
  /** The area's own outline, for countries that draw it. */
  polygons: Polygon[];
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseTagValue: false,
  isArray: (name) => ['entry', 'link', 'geocode', 'polygon', 'info', 'parameter', 'area'].includes(name),
});

type Node = Record<string, unknown>;
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const nodes = (value: unknown): Node[] => (Array.isArray(value) ? (value as Node[]) : []);

/** CAP polygons are "lat,lon lat,lon …"; GeoJSON order is [lon, lat]. */
export function parseCapPolygon(value: string): Polygon | null {
  const ring: Point[] = [];
  for (const pair of value.trim().split(/\s+/)) {
    const [lat, lon] = pair.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    ring.push([lon!, lat!]);
  }
  return ring.length >= 4 ? [ring] : null;
}

export function parseFeed(body: string): FeedEntry[] {
  const feed = (xml.parse(body) as Node).feed as Node | undefined;
  return nodes(feed?.entry).flatMap((entry) => {
    const capUrl = nodes(entry.link).find((link) => link.type === 'application/cap+xml')?.href;
    if (typeof capUrl !== 'string') return [];
    return [
      {
        capUrl,
        status: text(entry.status),
        messageType: text(entry.message_type),
        severity: text(entry.severity),
        event: text(entry.event),
        onset: text(entry.onset) || text(entry.effective),
        expires: text(entry.expires),
        regions: nodes(entry.geocode)
          .filter((geocode) => text(geocode.valueName) === 'EMMA_ID')
          .map((geocode) => text(geocode.value)),
        polygons: nodes(entry.polygon)
          .map((polygon) => parseCapPolygon(text(polygon)))
          .filter((polygon): polygon is Polygon => polygon !== null),
      },
    ];
  });
}

const SEVERITY_LEVELS: Record<string, AlertLevel> = { Moderate: 'yellow', Severe: 'orange', Extreme: 'red' };

/** "3; orange; Severe" → orange; falls back to CAP severity. Null for green / minor. */
function levelOf(awareness: string, severity: string): AlertLevel | null {
  const number = Number(awareness.split(';')[0]);
  if (number >= 2 && number <= 4) return ALERT_LEVELS[number - 2]!;
  return SEVERITY_LEVELS[severity] ?? null;
}

/** MeteoAlarm awareness type numbers (CAP profile v2.0); 11 is unused there. */
const TYPE_NUMBERS: Record<number, AlertType> = {
  1: 'wind', 2: 'snow-ice', 3: 'thunderstorm', 4: 'fog', 5: 'high-temperature',
  6: 'low-temperature', 7: 'coastal-event', 8: 'forest-fire', 9: 'avalanches', 10: 'rain',
  12: 'flooding', 13: 'rain-flood', 14: 'marine-hazard', 15: 'drought',
};

function typeOf(awareness: string): AlertType {
  const type = TYPE_NUMBERS[Number(awareness.split(';')[0])];
  return type && ALERT_TYPES.includes(type) ? type : 'other';
}

/** A parsed CAP warning, plus the identifiers of earlier versions it replaces. */
export type CapAlert = ProviderAlert & { replaces: string[] };

/** The full warning: level, type, times and texts in every language the issuer gave. */
export function parseCap(body: string, entry: Pick<FeedEntry, 'severity' | 'event' | 'onset' | 'expires'>): CapAlert | null {
  const alert = (xml.parse(body) as Node).alert as Node | undefined;
  const infos = nodes(alert?.info);
  if (!alert || infos.length === 0) return null;
  const parameter = (info: Node, name: string) =>
    text(nodes(info.parameter).find((p) => text(p.valueName) === name)?.value);
  const first = infos[0]!;
  const level = levelOf(parameter(first, 'awareness_level'), text(first.severity) || entry.severity);
  if (!level) return null;
  const optional = (value: string) => value || undefined;
  const texts: AlertText[] = infos.map((info) => ({
    language: text(info.language) || 'en',
    event: text(info.event) || entry.event,
    headline: optional(text(info.headline)),
    description: optional(text(info.description)),
    instruction: optional(text(info.instruction)),
    sender: optional(text(info.senderName)),
    web: optional(text(info.web)),
  }));
  return {
    id: text(alert.identifier),
    // "sender,identifier,sent sender,identifier,sent": an update names what it replaces.
    replaces: text(alert.references)
      .split(/\s+/)
      .map((reference) => reference.split(',')[1])
      .filter((id): id is string => !!id),
    level,
    type: typeOf(parameter(first, 'awareness_type')),
    // Optional in CAP: without it a warning is in force from when it took effect or was sent.
    onset: text(first.onset) || text(first.effective) || entry.onset || text(alert.sent),
    expires: text(first.expires) || entry.expires,
    texts,
  };
}

export interface MeteoAlarmOptions {
  /** Region borders, loaded on first use (a few MB that a server without warnings never needs). */
  regions: () => Promise<RegionIndex>;
  feedTtlMs: number;
  /** A warning's full text never changes (an update is a new warning), so it is kept longer. */
  capTtlMs?: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  now?: () => number;
}

/**
 * Official warnings of European national weather services through MeteoAlarm (EUMETNET).
 *
 * MeteoAlarm has no lookup by coordinates: its feeds list warnings per country, each for
 * regions (EMMA_ID codes) or for a drawn polygon. So the place is matched here: the region
 * file (MeteoAlarm's own borders) says which regions and countries are near it, the
 * countries' feeds say what is in force there, and the warning's full CAP gives the type
 * and the texts. Feeds are cached per country, shared by every place in it.
 *
 * Terms (CC BY 4.0 equivalent): texts unmodified, "EUMETNET – MeteoAlarm" credited with a
 * link, and at most 10 minutes' delay, hence the short feed TTL.
 */
export class MeteoAlarmProvider implements AlertsProvider {
  readonly attribution = { name: 'EUMETNET – MeteoAlarm', url: 'https://meteoalarm.org' };

  private readonly feeds: TtlCache<Promise<FeedEntry[]>>;
  private readonly caps: TtlCache<Promise<CapAlert | null>>;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private regionIndex: Promise<RegionIndex> | null = null;

  constructor(private readonly options: MeteoAlarmOptions) {
    this.now = options.now ?? Date.now;
    this.feeds = new TtlCache(options.feedTtlMs, 50, this.now);
    this.caps = new TtlCache(options.capTtlMs ?? 60 * 60 * 1000, 1000, this.now);
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async getAlerts(latitude: number, longitude: number): Promise<ProviderAlert[]> {
    const point: Point = [longitude, latitude];
    const index = await this.regions();
    let regions = index.codesNear(latitude, longitude);
    if (regions.size === 0) regions = index.codesNear(latitude, longitude, COAST_FALLBACK_KM);
    // Countries the place is known to be in (or within NEAR_REGION_KM of), by region borders.
    const known = index.countriesOf(regions);
    // Countries that draw their warning areas, found only by rough boxes: often a neighbour.
    const guessed = Object.entries(POLYGON_COUNTRIES)
      .filter(([country, bbox]) => !known.has(country) && bboxContains(bbox, point))
      .map(([country]) => country);

    const countries = [...known, ...guessed].filter((country) => FEEDS[country]);
    const results = await Promise.allSettled(countries.map((country) => this.feed(country)));
    // A failed feed only fails the request if it may hold the place's own warnings: a known
    // country's, or a guessed one's unless the place lies well inside a region-file country.
    // Otherwise Norway's outage would hide Helsinki's warnings, the UK's Dublin's. "Well
    // inside", not "near" or just "inside": Kreuzlingen is in Switzerland within 1.5 km of
    // Germany, and with places rounded to ~1 km and borders simplified it can even land
    // inside Germany; a failed Swiss feed must not quietly leave it with Germany's warnings.
    const failed = countries.filter((country, i) => results[i]!.status === 'rejected');
    const insideKnown = index.isWellInside(latitude, longitude, NEAR_REGION_KM);
    if (failed.some((country) => known.has(country)) || (!insideKnown && failed.length > 0)) {
      const reason = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')!.reason;
      throw reason;
    }
    const feeds = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));

    const now = this.now();
    const capUrls = new Map<string, FeedEntry>();
    for (const entry of feeds.flat()) {
      if (entry.status !== 'Actual' || entry.messageType === 'Cancel') continue;
      if (!(Date.parse(entry.expires) > now)) continue;
      const here =
        entry.regions.some((code) => regions.has(code)) || polygonsNear(entry.polygons, point, NEAR_REGION_KM);
      if (here) capUrls.set(entry.capUrl, entry);
    }

    const alerts = (await Promise.all([...capUrls].map(([url, entry]) => this.cap(url, entry)))).filter(
      (alert): alert is CapAlert => alert !== null,
    );
    // A feed can list a warning and its update side by side: keep only the latest version.
    const replaced = new Set(alerts.flatMap((alert) => alert.replaces));
    return alerts
      .filter((alert) => !replaced.has(alert.id))
      .map(({ replaces: _replaces, ...alert }) => alert);
  }

  private regions(): Promise<RegionIndex> {
    // A failed load is retried on the next request instead of being remembered.
    this.regionIndex ??= this.options.regions().catch((err: unknown) => {
      this.regionIndex = null;
      throw err;
    });
    return this.regionIndex;
  }

  /** Cached as a promise, so concurrent requests for one country share a download. */
  private feed(country: string): Promise<FeedEntry[]> {
    return this.cached(this.feeds, country, async () => parseFeed(await this.fetchText(`${FEED_URL}${FEEDS[country]}`)));
  }

  /**
   * The full warning. If it can't be loaded, the feed's own summary still makes a warning
   * (type unknown, English event name): showing it beats hiding an official warning.
   */
  private cap(url: string, entry: FeedEntry): Promise<CapAlert | null> {
    return this.cached(this.caps, url, async () => parseCap(await this.fetchText(url), entry)).catch(() => {
      const level = SEVERITY_LEVELS[entry.severity];
      return level
        ? {
            id: url,
            level,
            type: 'other' as const,
            onset: entry.onset,
            expires: entry.expires,
            texts: [{ language: 'en', event: entry.event }],
            replaces: [],
          }
        : null;
    });
  }

  private cached<T>(cache: TtlCache<Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit) return hit;
    const promise = load();
    cache.set(key, promise);
    // Errors are not cached: the next request tries again.
    promise.catch(() => {
      if (cache.get(key) === promise) cache.delete(key);
    });
    return promise;
  }

  private async fetchText(url: string): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchFn(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (err) {
      throw new ProviderError(`${new URL(url).host}: ${(err as Error).name === 'TimeoutError' ? 'timeout' : 'network error'}`);
    }
    if (!response.ok) throw new ProviderError(`${new URL(url).host}: HTTP ${response.status}`);
    return response.text();
  }
}
