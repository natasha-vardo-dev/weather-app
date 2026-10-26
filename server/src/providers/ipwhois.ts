import { ProviderError } from '../errors.js';
import type { IpLocator } from './types.js';

const BASE_URL = 'https://ipwho.is/';

/**
 * Answers meaning "this address can't be placed": final, so cached. Anything else with
 * success: false (a quota or rate limit, which ipwho.is reports in the body, not as an
 * HTTP error) is a failure of the moment and must not be cached for a day.
 */
const UNPLACEABLE = /reserved range|invalid ip|private range/i;

interface IpWhoIs {
  success: boolean;
  /** Why it failed, e.g. "Reserved range" for private addresses. */
  message?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * ipwho.is: HTTPS, no key, city-level answers. The free plan is for low, non-commercial
 * traffic (like Open-Meteo's), which suits a fallback used only when the browser fails;
 * results are cached per IP. Another service would be another IpLocator.
 */
export class IpWhoIsLocator implements IpLocator {
  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs = 4000,
  ) {}

  async locate(ip: string | null): Promise<{ latitude: number; longitude: number } | null> {
    const url = new URL(ip ? encodeURIComponent(ip) : '', BASE_URL);
    url.searchParams.set('fields', 'success,message,latitude,longitude');
    const where = `${url.host}`;
    let response: Response;
    try {
      response = await this.fetchFn(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (err) {
      throw new ProviderError(`${where}: ${String(err)}`);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ProviderError(`${where}: HTTP ${response.status} ${body.slice(0, 200)}`.trim());
    }
    const data = (await response.json()) as IpWhoIs;
    if (!data.success) {
      if (UNPLACEABLE.test(data.message ?? '')) return null;
      throw new ProviderError(`${where}: ${data.message ?? 'unknown failure'}`);
    }
    if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') return null;
    return { latitude: data.latitude, longitude: data.longitude };
  }
}
