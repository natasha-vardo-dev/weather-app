interface Entry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Small in-memory cache with time-to-live and a size limit.
 * Good enough for a single instance; swap for Redis when scaling horizontally.
 */
export class TtlCache<T> {
  private readonly store = new Map<string, Entry<T>>();

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
}
