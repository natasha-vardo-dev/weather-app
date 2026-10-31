import { afterEach, describe, expect, it, vi } from 'vitest';
import middleware, { config } from '../middleware';

afterEach(() => vi.unstubAllEnvs());

/** What the middleware tells Vercel's router: where to send the request, with which headers. */
function instructions(response: Response) {
  const sentHeaders = (response.headers.get('x-middleware-override-headers') ?? '').split(',').filter(Boolean);
  return {
    destination: response.headers.get('x-middleware-rewrite'),
    sentHeaders,
    header: (name: string) => response.headers.get(`x-middleware-request-${name}`),
  };
}

describe('Vercel middleware', () => {
  it('handles /api only', () => {
    expect(config.matcher).toBe('/api/:path*');
  });

  it('rewrites to the API with the secret and the address Vercel saw, dropping what the client sent', () => {
    vi.stubEnv('API_ORIGIN', 'https://weather-api.onrender.com');
    vi.stubEnv('PROXY_SECRET', 'the-secret');

    const response = middleware(
      new Request('https://weather.app/api/forecast?lat=52.23&lon=21.01', {
        headers: {
          'x-real-ip': '198.51.100.7',
          'x-forwarded-for': '198.51.100.7',
          accept: 'application/json',
          // Forged by the client: never passed on as they came.
          'x-proxy-secret': 'guess',
          'x-client-ip': '203.0.113.1',
        },
      }),
    );

    const sent = instructions(response);
    expect(sent.destination).toBe('https://weather-api.onrender.com/api/forecast?lat=52.23&lon=21.01');
    expect(sent.header('x-proxy-secret')).toBe('the-secret');
    expect(sent.header('x-client-ip')).toBe('198.51.100.7');
    // The rest of the request goes on as it came; the Host is the API's own.
    expect(sent.header('accept')).toBe('application/json');
    expect(sent.sentHeaders).not.toContain('host');
  });

  it('without a secret set, sends none (and drops a forged one)', () => {
    vi.stubEnv('API_ORIGIN', 'https://weather-api.onrender.com');
    const response = middleware(
      new Request('https://weather.app/api/push/topics', { method: 'POST', headers: { 'x-proxy-secret': 'guess' } }),
    );
    expect(instructions(response).sentHeaders).not.toContain('x-proxy-secret');
  });

  it('says what is missing when API_ORIGIN is not set', async () => {
    const response = middleware(new Request('https://weather.app/api/forecast'));
    expect(response.status).toBe(500);
    expect(response.headers.has('x-middleware-rewrite')).toBe(false);
    expect((await response.json()).error.message).toBe('API_ORIGIN is not set.');
  });
});
