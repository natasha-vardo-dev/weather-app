interface Entry<T> {
  value: T;
  expiresAt: number;
}

/** How a cache is doing, for the metrics. */
export interface CacheStats {
  hits: number;
  misses: number;
  /** Requests that joined a load already in flight instead of starting their own. */
  coalesced: number;
  size: number;
}

/**
 * Small in-memory cache with time-to-live and a size limit.
 * Good enough for a single instance; swap for Redis when scaling horizontally.
 */
export class TtlCache<T> {
  private readonly store = new Map<string, Entry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();
  private readonly counts = { hits: 0, misses: 0, coalesced: 0 };

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      // Map keeps insertion order, so the first key is the oldest one.
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  /**
   * Cache-aside with one load per key at a time: the cached value, the load already in flight,
   * or a new load. Without the second, ten people opening one city in the same second were ten
   * requests to the provider (a cache stampede when a popular entry expires).
   *
   * A failed load is not cached, and everyone who waited on it gets the error; the next call
   * loads again. `keep` can refuse to cache a value (a fallback forced by an error elsewhere).
   */
  getOrLoad(key: string, load: () => Promise<T>, keep: (value: T) => boolean = () => true): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      this.counts.hits += 1;
      return Promise.resolve(cached);
    }
    const pending = this.inFlight.get(key);
    if (pending) {
      this.counts.coalesced += 1;
      return pending;
    }
    this.counts.misses += 1;
    const promise = load()
      .then((value) => {
        if (keep(value)) this.set(key, value);
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  stats(): CacheStats {
    return { ...this.counts, size: this.store.size };
  }
}
