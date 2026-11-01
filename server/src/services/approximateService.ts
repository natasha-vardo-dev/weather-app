import { createHmac, randomBytes } from 'node:crypto';
import type { ReversePlace } from '@weather/shared';
import type { IpLocator } from '../providers/types.js';
import { TtlCache } from './cache.js';
import type { PlaceService } from './placeService.js';

/** Loopback, private (RFC 1918), link-local and unique-local addresses, IPv4 and IPv6. */
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(v4)) return true;
  const m = /^172\.(\d+)\./.exec(v4);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  const lower = ip.toLowerCase();
  return lower === '::1' || lower === '::' || /^(fc|fd|fe80)/.test(lower);
}

/**
 * What the cache keeps instead of an IP address: a keyed hash, the same for one address while
 * the process lives, and with the key never stored, not to be turned back into the address
 * (unlike a plain hash: there are few enough IPv4 addresses to hash them all). So a day's
 * cache does not hold who asked from where (privacy policy; found by roborev).
 */
export function ipFingerprint(ip: string, key: Buffer): string {
  return createHmac('sha256', key).update(ip).digest('base64url');
}

/**
 * "Looks like you're in Warsaw": the user's city from their IP, offered when the browser
 * can't give a position. The position then goes through PlaceService, so it becomes the
 * city with its id, like the crosshair's answer.
 *
 * The client's IP comes from Express (`req.ip`, which respects `trust proxy`). Behind
 * Vercel and Caddy it is in X-Forwarded-For, so TRUST_PROXY must be set there. A private
 * address means the request did not come from the internet: in development that is the
 * developer's own machine, so the service's own public address is looked up instead
 * (allowSelfLookup, opt-in with IP_SELF_LOOKUP=1). On a server that would locate the data
 * centre, so without the opt-in it answers "unknown" instead.
 */
export class ApproximateLocationService {
  /** The key of ipFingerprint: random per process, never stored. */
  private readonly fingerprintKey = randomBytes(32);
  /** Per IP fingerprint (ipFingerprint); null caches "no location for this address" too. */
  private readonly cache = new TtlCache<{ latitude: number; longitude: number } | null>(24 * 60 * 60 * 1000);

  constructor(
    private readonly locator: IpLocator,
    private readonly places: PlaceService,
    private readonly allowSelfLookup: boolean,
    /** Run before each lookup (not for cached ones): throws to refuse it near ipwho.is's cap. */
    private readonly budget: () => void = () => {},
  ) {}

  async approximate(ip: string | undefined, language = 'en'): Promise<ReversePlace | null> {
    const publicIp = ip && !isPrivateIp(ip) ? ip : null;
    if (!publicIp && !this.allowSelfLookup) return null;

    const key = publicIp ? ipFingerprint(publicIp, this.fingerprintKey) : 'self';
    const position = await this.cache.getOrLoad(key, async () => {
      this.budget();
      return this.locator.locate(publicIp);
    });
    if (!position) return null;
    return (await this.places.reverse(position.latitude, position.longitude, language)).place;
  }
}
