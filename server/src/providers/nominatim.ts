import type { PlaceName } from '@weather/shared';
import { ProviderError } from '../errors.js';
import { MAX_BYTES, readErrorText, readJson } from './http.js';
import type { ReverseGeocoder } from './types.js';

const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';

/** The part of Nominatim's jsonv2 answer we use. */
interface NominatimReverse {
  /** Set instead of a place when there is nothing there, e.g. "Unable to geocode" at sea. */
  error?: string;
  name?: string;
  address?: Partial<
    Record<'city' | 'town' | 'village' | 'hamlet' | 'municipality' | 'county' | 'state' | 'country', string>
  >;
}

export interface NominatimOptions {
  /**
   * Nominatim's usage policy requires an identifying User-Agent (app name and a contact
   * or project URL); requests with a generic one get blocked.
   */
  userAgent: string;
  /** The policy allows at most one request per second. */
  minIntervalMs?: number;
  /**
   * Longest wait for a slot; beyond it a request fails at once instead of queueing.
   * The client gives up on the name after 4 s anyway, and an unbounded queue would let
   * a burst of uncached requests delay every later user by minutes.
   */
  maxQueueMs?: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Reverse geocoding through OpenStreetMap's public Nominatim: free, no key, names in any
 * language. Its policy (1 request per second, identifying User-Agent, attribution) suits
 * this app because the service caches names; heavy traffic would need a paid service or
 * an own Nominatim, which only means another ReverseGeocoder.
 */
export class NominatimGeocoder implements ReverseGeocoder {
  private readonly userAgent: string;
  private readonly minIntervalMs: number;
  private readonly maxQueueMs: number;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** When the next request may start: requests are spaced out, refused only past maxQueueMs. */
  private nextSlot = 0;

  constructor(options: NominatimOptions) {
    this.userAgent = options.userAgent;
    this.minIntervalMs = options.minIntervalMs ?? 1100;
    this.maxQueueMs = options.maxQueueMs ?? 3000;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async reverse(latitude: number, longitude: number, language: string): Promise<PlaceName | null> {
    const url = new URL(REVERSE_URL);
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('format', 'jsonv2');
    // City level: a weather page names the town, not the street.
    url.searchParams.set('zoom', '10');
    url.searchParams.set('accept-language', language);

    const where = `${url.host}${url.pathname}`;
    await this.waitForSlot(where);
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        headers: { 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new ProviderError(`${where}: ${String(err)}`);
    }
    if (!response.ok) {
      const body = await readErrorText(response, where);
      throw new ProviderError(`${where}: HTTP ${response.status} ${body.slice(0, 200)}`.trim());
    }

    const data = ((await readJson(response, MAX_BYTES.json, where)) ?? {}) as NominatimReverse;
    if (data.error) return null;
    // Cast, not checked by the type: only strings go out as names.
    const a = (typeof data.address === 'object' && data.address) || {};
    const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
    const name =
      text(a.city) ??
      text(a.town) ??
      text(a.village) ??
      text(a.hamlet) ??
      text(a.municipality) ??
      text(a.county) ??
      text(a.state) ??
      text(data.name);
    if (!name) return null;
    const country = text(a.country);
    return { name, ...(country ? { country } : {}) };
  }

  /** Spaces requests at least minIntervalMs apart, in arrival order; refuses a too long wait. */
  private async waitForSlot(where: string): Promise<void> {
    const now = this.now();
    const start = Math.max(now, this.nextSlot);
    // Not queued, so a refused request takes no slot from later ones.
    if (start - now > this.maxQueueMs) throw new ProviderError(`${where}: queue full (rate limit of 1 request/s)`);
    this.nextSlot = start + this.minIntervalMs;
    if (start > now) await this.sleep(start - now);
  }
}
