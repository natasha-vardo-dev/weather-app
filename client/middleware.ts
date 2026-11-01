import { rewrite } from '@vercel/functions/middleware';

/**
 * Vercel Routing Middleware: sends /api/* to the API server (API_ORIGIN, on Render) with
 * two headers the server trusts only together:
 * - X-Proxy-Secret (PROXY_SECRET, the same on both): the API refuses requests without it,
 *   so nobody can call the API host directly with a forged X-Forwarded-For;
 * - X-Client-IP: the user's address as Vercel saw it (Vercel sets x-real-ip and overwrites
 *   x-forwarded-for, so a client cannot fake them here). The server takes it as the request's
 *   IP for rate limits and the approximate location, instead of counting proxies in
 *   X-Forwarded-For, whose handling on a forwarded request Vercel does not document.
 *
 * A rewrite, not a fetch of its own: Vercel's router proxies the request, as the plain rewrite
 * in vercel.json did, so the middleware returns at once. Fetching here, it would hold every
 * request open, and the Edge runtime gives up after about 25 s: a free Render instance waking
 * up (up to a minute) would have answered with Vercel's 504 page. (Found by roborev.)
 * vercel.json's rewrites cannot add request headers, hence the middleware.
 *
 * Runs only on Vercel; locally the Vite proxy forwards /api and the server, without
 * PROXY_SECRET, serves every request. Both variables are set in the Vercel project's settings.
 */

declare const process: { env: Record<string, string | undefined> };

export const config = { matcher: '/api/:path*' };

/** Forged by a client, or for the platform: never passed on as they came. */
const DROPPED = ['host', 'x-proxy-secret', 'x-client-ip'];

function misconfigured(message: string): Response {
  return Response.json(
    { error: { code: 'INTERNAL', message } },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * API_ORIGIN as a bare https origin, or null. The secret and the user's address travel to it,
 * so a typo (http://, a path, credentials in the URL) fails closed instead of sending them
 * in the clear or somewhere unexpected. Plain http only for a local server.
 */
export function apiOrigin(raw: string | undefined): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const secure = url.protocol === 'https:' || (local && url.protocol === 'http:');
  const bare = url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
  return secure && bare ? url : null;
}

export default function middleware(request: Request): Response {
  if (!process.env.API_ORIGIN) return misconfigured('API_ORIGIN is not set.');
  const origin = apiOrigin(process.env.API_ORIGIN);
  if (!origin) return misconfigured('API_ORIGIN must be an https:// origin.');
  // The API refuses requests without the secret in production; say why here instead.
  if (process.env.VERCEL_ENV === 'production' && !process.env.PROXY_SECRET) {
    return misconfigured('PROXY_SECRET is not set.');
  }
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, origin);

  const headers = new Headers(request.headers);
  for (const name of DROPPED) headers.delete(name);
  const clientIp =
    request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  if (clientIp) headers.set('x-client-ip', clientIp);
  const secret = process.env.PROXY_SECRET;
  if (secret) headers.set('x-proxy-secret', secret);

  // The headers replace the incoming ones on the request sent to the API.
  return rewrite(target, { request: { headers } });
}
