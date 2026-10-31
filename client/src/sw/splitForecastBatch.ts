/**
 * Workbox `cacheDidUpdate` for the API route: when a batch of forecasts (/api/v1/forecasts) is
 * stored, each forecast in it is stored too under the URL its city page asks for alone
 * (/api/v1/forecast?lat=…&lon=…&days=…, the same version as the batch). Saved cities are loaded in batches on the start page and
 * in the strip, while a city page loads its own /forecast; without this, a saved city seen
 * only as a card could not be opened offline, although the card showed its forecast. (Found
 * by roborev.)
 *
 * Serialized into sw.js by vite-plugin-pwa: no outside references, only the arguments and
 * service-worker globals. The URL must match `getForecast` in the shared API client: the same
 * parameters, in the same order, with the numbers as the batch carried them. Only stored
 * batches get here, and a partial one is `no-store` (not stored), so a copy is never written
 * from a failed answer; items with an error are skipped anyway. The Date header is the
 * batch's, so the expiration plugin treats a copy as old as the batch.
 *
 * Written with `cache.put`, the copies are outside the expiration plugin's bookkeeping (it
 * counts only what it stores itself), so they are cleaned up here: each time a batch is
 * stored, city copies older than a day (the route's maxAgeSeconds) are deleted. Otherwise a
 * city once saved and removed would stay in the cache for good. (Found by roborev.)
 */
export async function splitForecastBatch({
  cacheName,
  request,
  newResponse,
}: {
  cacheName: string;
  request: Request;
  newResponse: Response;
}): Promise<void> {
  const url = new URL(request.url);
  // Any API version: a page still on the old code may ask the old one; its copies keep its path.
  if (!/^\/api\/v\d+\/forecasts$/.test(url.pathname)) return;
  const singlePath = url.pathname.slice(0, -1);
  const places = (url.searchParams.get('places') ?? '').split(';');
  const days = url.searchParams.get('days');
  let body: { forecasts?: Array<{ forecast?: unknown }> };
  try {
    body = await newResponse.clone().json();
  } catch {
    return;
  }
  if (!Array.isArray(body.forecasts) || body.forecasts.length !== places.length) return;
  const cache = await caches.open(cacheName);
  const date = newResponse.headers.get('Date');
  await Promise.all(
    body.forecasts.map((item, i) => {
      const [lat, lon] = places[i]!.split(',');
      if (!item || !('forecast' in item) || !lat || !lon) return undefined;
      const single = new URL(singlePath, url.origin);
      single.searchParams.set('lat', lat);
      single.searchParams.set('lon', lon);
      if (days) single.searchParams.set('days', days);
      const headers = new Headers({ 'Content-Type': 'application/json' });
      if (date) headers.set('Date', date);
      return cache.put(single.toString(), new Response(JSON.stringify(item.forecast), { status: 200, headers }));
    }),
  );

  // A day, as the route's maxAgeSeconds (a literal: this function is serialized on its own).
  const maxAgeMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const copies = (await cache.keys()).filter((key) => new URL(key.url).pathname === singlePath);
  await Promise.all(
    copies.map(async (key) => {
      const copy = await cache.match(key);
      const stored = Date.parse(copy?.headers.get('Date') ?? '');
      if (!copy || (Number.isFinite(stored) && now - stored > maxAgeMs)) await cache.delete(key);
    }),
  );
}
