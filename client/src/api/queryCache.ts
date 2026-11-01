/**
 * Small in-memory cache for API responses, shared by every component in the tab.
 *
 * - A fresh value is available synchronously, so a component that mounts for an already
 *   loaded place renders it at once instead of flashing a loading state.
 * - Concurrent loads of one key share a single request (a favourite tile and the city
 *   page asking for the same forecast).
 * - Errors are not cached: the next load tries again; neither are values `keep` rejects.
 *
 * The TTL should not exceed the server's Cache-Control max-age: caches stack, so a longer
 * client TTL would only show older data.
 */
export interface QueryCache<T> {
  /** Fresh value or undefined. */
  get(key: string): T | undefined;
  /** Cached value, the in-flight request, or a new request. */
  load(key: string, fetcher: () => Promise<T>): Promise<T>;
  /** Milliseconds since the key's value was stored, expired or not; undefined without one. */
  age(key: string): number | undefined;
  /**
   * Called with the key whenever a loaded value is stored, so components showing the key
   * pick up a value another component refreshed. Returns the unsubscribe function.
   */
  subscribe(listener: (key: string) => void): () => void;
}

export function createQueryCache<T>(options: {
  ttlMs: number;
  maxEntries?: number;
  now?: () => number;
  /** Whether a loaded value may be cached (e.g. not a fallback the server marked no-store). */
  keep?: (value: T) => boolean;
}): QueryCache<T> {
  const { ttlMs, maxEntries = 50, now = () => Date.now(), keep = () => true } = options;
  const values = new Map<string, { value: T; storedAt: number }>();
  const inFlight = new Map<string, Promise<T>>();
  const listeners = new Set<(key: string) => void>();

  function get(key: string): T | undefined {
    const entry = values.get(key);
    if (!entry) return undefined;
    if (now() - entry.storedAt > ttlMs) {
      values.delete(key);
      return undefined;
    }
    return entry.value;
  }

  function load(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = get(key);
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = inFlight.get(key);
    if (pending) return pending;

    const request = fetcher()
      .then((value) => {
        if (!keep(value)) return value;
        values.delete(key); // re-insert so Map order stays oldest-first
        values.set(key, { value, storedAt: now() });
        if (values.size > maxEntries) values.delete(values.keys().next().value!);
        for (const listener of [...listeners]) listener(key);
        return value;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
  }

  function age(key: string): number | undefined {
    const entry = values.get(key);
    return entry ? now() - entry.storedAt : undefined;
  }

  function subscribe(listener: (key: string) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { get, load, age, subscribe };
}
