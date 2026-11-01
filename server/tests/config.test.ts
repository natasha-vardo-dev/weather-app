import { describe, expect, it } from 'vitest';
import { isProduction, loadConfig } from '../src/config.js';

const SECRET = 'a'.repeat(32);
const ACCOUNT = JSON.stringify({ project_id: 'demo', client_email: 'x@demo.iam', private_key: 'k' });

/** A production setup that passes: what README's "Deployment" asks for. */
const PRODUCTION = { NODE_ENV: 'production', PROXY_SECRET: SECRET, TRUST_PROXY: '1' };

describe('loadConfig', () => {
  it('keeps every setting optional locally', () => {
    const config = loadConfig({ IP_SELF_LOOKUP: '1' });
    expect(config.production).toBe(false);
    expect(config.proxySecret).toBeUndefined();
    expect(config.trustProxy).toBe(false);
    expect(config.ipSelfLookup).toBe(true);
    expect(config.corsOrigins).toEqual(['http://localhost:5173']);
    expect(config.host).toBeUndefined();
  });

  it('listens on the given address only', () => {
    expect(loadConfig({ LISTEN_HOST: '127.0.0.1' }).host).toBe('127.0.0.1');
  });

  it('treats Render or NODE_ENV=production as production', () => {
    expect(isProduction({ RENDER: 'true' })).toBe(true);
    expect(isProduction({ NODE_ENV: 'production' })).toBe(true);
    expect(isProduction({ NODE_ENV: 'development' })).toBe(false);
  });

  it('accepts a complete production setup, with no CORS origins by default', () => {
    const config = loadConfig(PRODUCTION);
    expect(config.production).toBe(true);
    expect(config.trustProxy).toBe(1);
    expect(config.corsOrigins).toEqual([]);
  });

  it('reports the deployed commit from the deploy script, else from Render', () => {
    expect(loadConfig({ GIT_COMMIT: 'abcdef1234567890' }).version).toBe('abcdef1');
    expect(loadConfig({ RENDER_GIT_COMMIT: '1234567890abcdef' }).version).toBe('1234567');
    expect(loadConfig({}).version).toBeUndefined();
  });

  it.each([
    ['without the proxy secret', { PROXY_SECRET: '' }, /PROXY_SECRET is required/],
    ['with a short proxy secret', { PROXY_SECRET: 'short' }, /PROXY_SECRET must be at least 32/],
    ['without TRUST_PROXY', { TRUST_PROXY: '' }, /TRUST_PROXY is required/],
    ['with IP_SELF_LOOKUP=1', { IP_SELF_LOOKUP: '1' }, /IP_SELF_LOOKUP=1 is for local development/],
    ['with push but no scheduler secret', { FIREBASE_SERVICE_ACCOUNT: ACCOUNT }, /ALERTS_NOTIFY_SECRET is required/],
    ['with a short metrics secret', { METRICS_SECRET: 'short' }, /METRICS_SECRET must be at least 32/],
    ['with an http CORS origin', { CORS_ORIGIN: 'http://example.com' }, /CORS_ORIGIN/],
    ['with a localhost CORS origin', { CORS_ORIGIN: 'https://localhost:5173' }, /CORS_ORIGIN/],
  ])('refuses to start in production %s', (_name, change, message) => {
    expect(() => loadConfig({ ...PRODUCTION, ...change })).toThrow(message);
  });

  it('lists every problem at once and never the secret itself', () => {
    let message = '';
    try {
      loadConfig({ RENDER: 'true', PROXY_SECRET: 'tooshort-secret', IP_SELF_LOOKUP: '1' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/PROXY_SECRET/);
    expect(message).toMatch(/TRUST_PROXY/);
    expect(message).toMatch(/IP_SELF_LOOKUP/);
    expect(message).not.toContain('tooshort-secret');
  });

  it('accepts push with both secrets, plain or base64', () => {
    const plain = loadConfig({ ...PRODUCTION, FIREBASE_SERVICE_ACCOUNT: ACCOUNT, ALERTS_NOTIFY_SECRET: SECRET });
    expect(plain.firebaseAccount?.project_id).toBe('demo');
    const base64 = Buffer.from(ACCOUNT).toString('base64');
    expect(loadConfig({ FIREBASE_SERVICE_ACCOUNT: base64 }).firebaseAccount?.project_id).toBe('demo');
  });

  it('refuses a service account that is not JSON, without printing it', () => {
    expect(() => loadConfig({ FIREBASE_SERVICE_ACCOUNT: '{not json' })).toThrow(
      /^FIREBASE_SERVICE_ACCOUNT is not a JSON key/,
    );
  });

  it('still refuses mistyped numbers', () => {
    expect(() => loadConfig({ FORECAST_CACHE_TTL: '0' })).toThrow(/positive number/);
    expect(() => loadConfig({ TRUST_PROXY: 'two' })).toThrow(/positive number/);
  });
});
