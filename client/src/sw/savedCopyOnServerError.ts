/**
 * Workbox `fetchDidSucceed` for the API route (NetworkFirst): a server error (5xx) counts as a
 * failed network when a saved copy of the answer exists, so NetworkFirst shows the copy, marked
 * as possibly out of date (savedResponses), instead of an error. The usual case: the API is
 * down and the site's proxy answers 502/504 itself; NetworkFirst alone falls back to the cache
 * only when fetch throws, and passed those answers on. Also the provider down for longer than
 * the API keeps stale data (502). Without a copy the error goes to the page as before, with
 * "Try again". A 4xx is the answer itself (an unknown place, a rate limit), never replaced.
 *
 * Any cache is searched, not only the API's: its name is not known here, and API answers are
 * kept nowhere else (an old version's cache holds other URLs).
 *
 * Only a copy NetworkFirst will use counts: its ExpirationPlugin refuses one whose `Date` header
 * is older than the route's maxAgeSeconds (a day, `DAY_SECONDS` in vite.config.ts; repeated
 * here, see below), and such copies stay in the cache until its next cleanup. Failing the answer
 * for one of them left the page nothing at all: "Check your internet" instead of the server's
 * own error.
 *
 * Remembers in Workbox's per-request plugin `state` that the server failed, for
 * `markServerErrorCopy` in the same plugin.
 *
 * Serialized into sw.js by vite-plugin-pwa: no outside references, only the arguments and
 * service-worker globals.
 */
export async function savedCopyOnServerError({
  request,
  response,
  state,
}: {
  request: Request;
  response: Response;
  state?: Record<string, unknown>;
}): Promise<Response> {
  if (response.status < 500) return response;
  const copy = await caches.match(request);
  // Without a readable Date the plugin takes the copy as fresh, and so does this.
  const savedAt = copy?.headers.has('date') ? new Date(copy.headers.get('date')!).getTime() : NaN;
  if (!copy || savedAt < Date.now() - 24 * 60 * 60 * 1000) return response;
  if (state) state.serverError = true;
  throw new Error(`Server error ${response.status}: the saved copy is used instead`);
}

/**
 * Workbox `cachedResponseWillBeUsed`, in the same plugin as `savedCopyOnServerError`: a copy used
 * because the server failed (not the network) is marked `X-From-Cache: server`, so the page says
 * the server is not responding rather than that the user is offline, whose connection works.
 * The plugin after it marks the other copies with `1`. Serialized into sw.js, like the above.
 */
export async function markServerErrorCopy({
  cachedResponse,
  state,
}: {
  cachedResponse?: Response | null;
  state?: Record<string, unknown>;
}): Promise<Response | null> {
  if (!cachedResponse || !state?.serverError) return cachedResponse ?? null;
  const headers = new Headers(cachedResponse.headers);
  headers.set('X-From-Cache', 'server');
  return new Response(cachedResponse.body, {
    status: cachedResponse.status,
    statusText: cachedResponse.statusText,
    headers,
  });
}
