interface Entry<T> {
  value: T;
  /** Until then the value is fresh: returned as it is. */
  freshUntil: number;
  /** Until then a stale value is returned at once while a new one loads in the background. */
  revalidateUntil: number;
  /** Until then a stale value is returned when loading a new one fails. */
  usableUntil: number;
  /** Approximate size, counted against maxBytes. */
  bytes: number;
}

/** A value and whether it is past its TTL (so callers can, say, let browsers keep it less long). */
export interface Cached<T> {
  value: T;
  stale: boolean;
}

/** How a cache is doing, for the metrics. */
export interface CacheStats {
  hits: number;
  misses: number;
  /** Requests that joined a load already in flight instead of starting their own. */
  coalesced: number;
  /** Requests answered with a stale value at once while it was refreshed in the background. */
  stale: number;
  /** Requests answered with a stale value because loading a new one failed. */
  staleOnError: number;
  /** Background refreshes that failed; the stale value stayed. */
  refreshErrors: number;
  /** Entries dropped to stay within maxEntries or maxBytes. */
  evictions: number;
  size: number;
  bytes: number;
}

export interface CacheOptions<T> {
  /**
   * Stale-while-revalidate: for how long after its TTL a value is still returned at once while
   * a new one loads in the background. Keep it short: in that window everyone gets the old
   * value, and with little traffic the one who triggers the refresh may be the last visitor
   * for a while. Default 0.
   */
  staleWhileRevalidateMs?: number;
  /**
   * Stale-if-error: for how long after its TTL a value is returned when loading a new one
   * fails (a provider outage), instead of the error. Between the two windows a request waits
   * for the provider, as on a miss. Default 0.
   */
  staleIfErrorMs?: number;
  /** Most entries kept; past it, the least recently used one goes. */
  maxEntries?: number;
  /** Most bytes kept (measured by `sizeOf`); past it, least recently used entries go. */
  maxBytes?: number;
  /** Size of a value in bytes. Default: its JSON in UTF-8 (only used with maxBytes). */
  sizeOf?: (value: T) => number;
  /**
   * Share of the TTL taken off at random, 0–1, so that entries stored together (a batch of
   * favourites, a burst after a restart) do not all expire, and hit the provider, together.
   * Only ever shortens: a TTL is also a promise to a data source (MeteoAlarm's 10 minutes).
   * Default 0.
   */
  jitter?: number;
  /**
   * Called once per failed load while a stale value is still kept (in the background, or
   * answered instead of the error). Such errors never reach the error handler, so without a
   * log an outage behind stale answers would leave no cause anywhere. (Found by roborev.)
   */
  onStaleError?: (err: unknown) => void;
  now?: () => number;
  random?: () => number;
}

const jsonBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
const nonNegative = (ms: number | undefined) => Math.max(ms ?? 0, 0);

/**
 * In-memory cache with time-to-live, stale-while-revalidate, stale-if-error, and limits in
 * entries and bytes, evicting the least recently used entry (LRU) first. One instance's
 * memory: lost on restart and not shared between instances; Redis is the step for that.
 *
 * Expired entries are dropped lazily, when read or evicted.
 */
export class TtlCache<T> {
  /** Map keeps insertion order; reading an entry moves it to the end, so the first key is the least recently used. */
  private readonly store = new Map<string, Entry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();
  private readonly counts = {
    hits: 0,
    misses: 0,
    coalesced: 0,
    stale: 0,
    staleOnError: 0,
    refreshErrors: 0,
    evictions: 0,
  };
  private totalBytes = 0;
  private readonly revalidateMs: number;
  private readonly ifErrorMs: number;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly sizeOf: (value: T) => number;
  private readonly jitter: number;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly onStaleError?: (err: unknown) => void;

  constructor(
    private readonly ttlMs: number,
    options: CacheOptions<T> = {},
  ) {
    this.revalidateMs = nonNegative(options.staleWhileRevalidateMs);
    this.ifErrorMs = nonNegative(options.staleIfErrorMs);
    this.maxEntries = options.maxEntries ?? 500;
    this.maxBytes = options.maxBytes ?? Infinity;
    this.sizeOf = options.sizeOf ?? jsonBytes;
    this.jitter = Math.min(Math.max(options.jitter ?? 0, 0), 1);
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.onStaleError = options.onStaleError;
  }

  /** The fresh value, or undefined. */
  get(key: string): T | undefined {
    const entry = this.read(key);
    return entry && entry.freshUntil > this.now() ? entry.value : undefined;
  }

  delete(key: string): void {
    const entry = this.store.get(key);
    if (!entry) return;
    this.store.delete(key);
    this.totalBytes -= entry.bytes;
  }

  set(key: string, value: T): void {
    // Measured only when there is a byte limit: JSON of a forecast is not free.
    const bytes = Number.isFinite(this.maxBytes) ? this.sizeOf(value) : 0;
    this.delete(key);
    // A value bigger than the whole budget would only evict everything else.
    if (bytes > this.maxBytes) return;
    while (this.store.size > 0 && (this.store.size >= this.maxEntries || this.totalBytes + bytes > this.maxBytes)) {
      const [oldest] = this.store.keys();
      this.delete(oldest!);
      this.counts.evictions += 1;
    }
    const freshUntil = this.now() + this.ttlMs * (1 - this.jitter * this.random());
    this.store.set(key, {
      value,
      freshUntil,
      revalidateUntil: freshUntil + this.revalidateMs,
      usableUntil: freshUntil + Math.max(this.revalidateMs, this.ifErrorMs),
      bytes,
    });
    this.totalBytes += bytes;
  }

  /** `load` with the value only. */
  getOrLoad(key: string, load: () => Promise<T>, keep: (value: T) => boolean = () => true): Promise<T> {
    return this.load(key, load, keep).then((cached) => cached.value);
  }

  /**
   * Cache-aside with one load per key at a time:
   * - fresh value: returned;
   * - stale, within stale-while-revalidate: returned at once, and a new one loads in the
   *   background (one at a time); if that fails, the stale value stays;
   * - stale, within stale-if-error: the request waits for a new value, as on a miss, and gets
   *   the stale one only if loading fails or `keep` refuses the new value;
   * - nothing usable: the load already in flight, or a new one.
   *
   * Without joining loads in flight, ten people opening one city in the same second were ten
   * requests to the provider (a cache stampede when a popular entry expires).
   *
   * A failed load is not cached; everyone who waited on it gets the error (or the stale
   * value), and the next call loads again. `keep` can refuse to cache a value (a fallback
   * forced by an error elsewhere).
   */
  load(key: string, load: () => Promise<T>, keep: (value: T) => boolean = () => true): Promise<Cached<T>> {
    const entry = this.read(key);
    const now = this.now();
    if (entry && entry.freshUntil > now) {
      this.counts.hits += 1;
      return Promise.resolve({ value: entry.value, stale: false });
    }
    if (entry && entry.revalidateUntil > now) {
      this.counts.stale += 1;
      if (!this.inFlight.has(key)) {
        this.start(key, load, keep, true).catch(() => {
          this.counts.refreshErrors += 1;
        });
      }
      return Promise.resolve({ value: entry.value, stale: true });
    }
    const pending = this.inFlight.get(key);
    if (pending) this.counts.coalesced += 1;
    else this.counts.misses += 1;
    const loaded = (pending ?? this.start(key, load, keep, entry !== undefined)).then((value) => ({
      value,
      stale: false,
    }));
    if (!entry) return loaded;
    // The entry was usable when the request came, so it is the answer if loading fails, even
    // when the provider's timeout ends past the window, and if the new value is one `keep`
    // refuses (a fallback forced by an error elsewhere): the old real value is better, as in a
    // background refresh. (Both found by roborev.)
    const old = (): Cached<T> => {
      this.counts.staleOnError += 1;
      return { value: entry.value, stale: true };
    };
    return loaded.then((cached) => (keep(cached.value) ? cached : old()), old);
  }

  stats(): CacheStats {
    return { ...this.counts, size: this.store.size, bytes: this.totalBytes };
  }

  /** The entry if still usable (fresh or stale), marked as just used; a dead one is dropped. */
  private read(key: string): Entry<T> | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.usableUntil <= this.now()) {
      this.delete(key);
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry;
  }

  /** `withStale`: started with a usable old value, which will hide a failure from the callers. */
  private start(key: string, load: () => Promise<T>, keep: (value: T) => boolean, withStale: boolean): Promise<T> {
    const promise = load()
      .then((value) => {
        if (keep(value)) this.set(key, value);
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    // A failure with no old value reaches the callers and the error handler, which logs it.
    // Decided when the load starts, not when it fails: the old entry may be evicted meanwhile,
    // and its callers still get it. (Found by roborev.)
    promise.catch((err: unknown) => {
      if (withStale) this.onStaleError?.(err);
    });
    this.inFlight.set(key, promise);
    return promise;
  }
}
