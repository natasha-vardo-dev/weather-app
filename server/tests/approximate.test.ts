import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { ProviderError } from '../src/errors.js';
import { IpWhoIsLocator } from '../src/providers/ipwhois.js';
import type { IpLocator } from '../src/providers/types.js';
import { ApproximateLocationService, ipFingerprint, isPrivateIp } from '../src/services/approximateService.js';
import { PlaceService } from '../src/services/placeService.js';
import { WeatherService } from '../src/services/weatherService.js';
import { createFakeProvider } from './fakeProvider.js';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const warsawCentre = { latitude: 52.2297666, longitude: 21.0117787 };

function setup(locate: IpLocator['locate'], allowSelfLookup = true) {
  const service = new WeatherService(createFakeProvider());
  const places = new PlaceService({ reverse: async () => ({ name: 'Warsaw', country: 'Poland' }) }, service);
  const locator = { locate: vi.fn(locate) };
  const approximate = new ApproximateLocationService(locator, places, allowSelfLookup);
  return { approximate, locator, places, service };
}

describe('isPrivateIp', () => {
  it.each([
    '127.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    '10.1.2.3',
    '192.168.0.5',
    '172.16.0.1',
    '172.31.255.1',
    'fd00::1',
    'fe80::1',
  ])('%s is private', (ip) => expect(isPrivateIp(ip)).toBe(true));
  it.each(['8.8.8.8', '165.225.206.155', '172.32.0.1', '2a00:1450::1'])('%s is public', (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });
});

describe('ApproximateLocationService', () => {
  it("locates the user's public IP and turns it into the city (coordinates and id)", async () => {
    const { approximate, locator } = setup(async () => warsawCentre);
    expect(await approximate.approximate('165.225.206.155', 'en')).toEqual({
      id: 1,
      name: 'Warsaw',
      country: 'Poland',
      latitude: 52.23,
      longitude: 21.01,
    });
    expect(locator.locate).toHaveBeenCalledWith('165.225.206.155');
  });

  it('looks up its own address for a private one in development, never in production', async () => {
    const dev = setup(async () => warsawCentre);
    expect(await dev.approximate.approximate('::1', 'en')).not.toBeNull();
    expect(dev.locator.locate).toHaveBeenCalledWith(null);

    // In production a private address means a misconfigured proxy: that would locate the data centre.
    const prod = setup(async () => warsawCentre, false);
    expect(await prod.approximate.approximate('10.0.0.7', 'en')).toBeNull();
    expect(prod.locator.locate).not.toHaveBeenCalled();
  });

  it('does not cache a lookup that failed', async () => {
    let fail = true;
    const { approximate, locator } = setup(async () => {
      if (fail) throw new ProviderError('quota');
      return warsawCentre;
    });
    await expect(approximate.approximate('8.8.8.8', 'en')).rejects.toBeInstanceOf(ProviderError);
    fail = false;
    expect(await approximate.approximate('8.8.8.8', 'en')).not.toBeNull();
    expect(locator.locate).toHaveBeenCalledTimes(2);
  });

  it('caches per IP, "unknown" included', async () => {
    const { approximate, locator } = setup(async (ip) => (ip === '8.8.8.8' ? warsawCentre : null));
    await approximate.approximate('8.8.8.8', 'en');
    await approximate.approximate('8.8.8.8', 'ru');
    expect(await approximate.approximate('1.1.1.1', 'en')).toBeNull();
    await approximate.approximate('1.1.1.1', 'en');
    expect(locator.locate).toHaveBeenCalledTimes(2);
  });
});

describe('ipFingerprint', () => {
  it('keeps one address apart from others without holding the address itself', () => {
    const key = Buffer.alloc(32, 7);
    const fingerprint = ipFingerprint('203.0.113.7', key);
    expect(fingerprint).not.toContain('203.0.113.7');
    expect(ipFingerprint('203.0.113.7', key)).toBe(fingerprint);
    expect(ipFingerprint('203.0.113.8', key)).not.toBe(fingerprint);
    // Another process, another key: nothing to match across restarts or against a table of all addresses.
    expect(ipFingerprint('203.0.113.7', Buffer.alloc(32, 8))).not.toBe(fingerprint);
  });
});

describe('IpWhoIsLocator', () => {
  it('asks for the given address, or the caller own with none', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ success: true, ...warsawCentre }));
    const locator = new IpWhoIsLocator(fetchFn as unknown as typeof fetch);
    expect(await locator.locate('8.8.8.8')).toEqual(warsawCentre);
    await locator.locate(null);
    const urls = fetchFn.mock.calls.map((call) => String((call as unknown[])[0]));
    expect(urls[0]).toMatch(/^https:\/\/ipwho\.is\/8\.8\.8\.8\?/);
    expect(urls[1]).toMatch(/^https:\/\/ipwho\.is\/\?/);
  });

  it('places nothing without finite numbers for both coordinates', async () => {
    const answers = [
      { success: true, latitude: '52', longitude: 21 },
      { success: true, latitude: Number.NaN, longitude: 21 },
      null,
    ];
    for (const body of answers) {
      const fetchFn = vi.fn(async () => jsonResponse(body));
      expect(
        await new IpWhoIsLocator(fetchFn as unknown as typeof fetch).locate('8.8.8.8').catch(() => 'error'),
      ).not.toEqual(expect.objectContaining({ latitude: expect.anything() }));
    }
    const string = vi.fn(async () => jsonResponse({ success: true, latitude: '52', longitude: 21 }));
    expect(await new IpWhoIsLocator(string as unknown as typeof fetch).locate('8.8.8.8')).toBeNull();
  });

  it('asks for an IPv6 address too (encoded colons; ipwho.is answers the same as unencoded)', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ success: true, latitude: 50.11, longitude: 8.68 }));
    const locator = new IpWhoIsLocator(fetchFn as unknown as typeof fetch);
    expect(await locator.locate('2a00:1450:4001:80b::200e')).toEqual({ latitude: 50.11, longitude: 8.68 });
    const url = new URL(String((fetchFn.mock.calls[0] as unknown[])[0]));
    expect(url.host).toBe('ipwho.is');
    expect(decodeURIComponent(url.pathname)).toBe('/2a00:1450:4001:80b::200e');
  });

  it('answers null for addresses it can not place ("Reserved range")', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ success: false, message: 'Reserved range' }));
    expect(await new IpWhoIsLocator(fetchFn as unknown as typeof fetch).locate('10.0.0.1')).toBeNull();
  });

  it('treats other failures in the body (quota, rate limit) as errors, so they are not cached', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ success: false, message: 'You have reached your monthly limit' }));
    const err = await new IpWhoIsLocator(fetchFn as unknown as typeof fetch).locate('8.8.8.8').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).detail).toMatch(/monthly limit/);
  });
});

describe('GET /api/v1/places/approximate', () => {
  function app(locate: IpLocator['locate'], trustProxy: number | boolean = false) {
    const { approximate, places, service } = setup(locate);
    return createApp(service, { places, approximate, trustProxy });
  }

  it('returns the city, never cacheable for anyone else', async () => {
    const res = await request(app(async () => warsawCentre)).get('/api/v1/places/approximate?lang=en');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Warsaw', latitude: 52.23 });
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it("uses the client's address from X-Forwarded-For only behind a trusted proxy", async () => {
    const seen: (string | null)[] = [];
    const locate = async (ip: string | null) => {
      seen.push(ip);
      return warsawCentre;
    };
    await request(app(locate, 1)).get('/api/v1/places/approximate').set('X-Forwarded-For', '8.8.8.8');
    // Not trusted: the header could be faked, so the connection's own (private) address is used.
    await request(app(locate, false)).get('/api/v1/places/approximate').set('X-Forwarded-For', '8.8.8.8');
    expect(seen).toEqual(['8.8.8.8', null]);
  });

  it('answers 404 when the address can not be placed', async () => {
    const res = await request(app(async () => null)).get('/api/v1/places/approximate');
    expect(res.status).toBe(404);
  });
});
