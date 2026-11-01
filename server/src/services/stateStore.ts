import type { Firestore } from 'firebase-admin/firestore';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Logger } from '../observability/logger.js';
import type { Metrics } from '../observability/metrics.js';

/**
 * Operational state that must outlive a restart or a deploy (ADR 0018): what the notifier has
 * sent, and provider usage against the limits. Forecast caches stay in memory (ADR 0003):
 * losing them costs a few provider calls, losing this repeats or skips notifications and
 * resets quota counters.
 *
 * Values are JSON documents by name; nothing here is about users (no tokens, addresses or
 * places): warning identifiers, timestamps and counts.
 */
export interface StateStore {
  /** Where it keeps state, for the logs: "memory" loses it on restart. */
  readonly kind: 'memory' | 'firestore';
  get<T>(name: string): Promise<T | null>;
  put(name: string, value: unknown): Promise<void>;
  /**
   * Takes or renews a lease on `name` for `holder` for `ttlMs`: true if this holder has it now.
   * During a deploy two instances overlap; the lease keeps one notifier run at a time.
   */
  lease(name: string, holder: string, ttlMs: number): Promise<boolean>;
  /** Gives the lease up early, if this holder has it. */
  release(name: string, holder: string): Promise<void>;
}

/** What `get` returns for a stored document that can't be decoded; matches no reader's shape. */
export const UNREADABLE = Object.freeze({ unreadable: true });

/** Without Firebase (local development, tests): as before, state lasts as long as the process. */
export class MemoryStateStore implements StateStore {
  readonly kind = 'memory';
  private readonly values = new Map<string, string>();
  private readonly leases = new Map<string, { holder: string; until: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async get<T>(name: string): Promise<T | null> {
    const json = this.values.get(name);
    return json === undefined ? null : (JSON.parse(json) as T);
  }

  async put(name: string, value: unknown): Promise<void> {
    // Stored as JSON, like Firestore: a caller can't keep a reference into the stored state.
    this.values.set(name, JSON.stringify(value));
  }

  async lease(name: string, holder: string, ttlMs: number): Promise<boolean> {
    const current = this.leases.get(name);
    if (current && current.holder !== holder && current.until > this.now()) return false;
    this.leases.set(name, { holder, until: this.now() + ttlMs });
    return true;
  }

  async release(name: string, holder: string): Promise<void> {
    if (this.leases.get(name)?.holder === holder) this.leases.delete(name);
  }
}

/**
 * Firestore, in the Firebase project push already uses (free tier: 20,000 writes and 50,000
 * reads a day; we write a few hundred). One document per name in `serverState`, the JSON
 * gzipped into a bytes field: a document holds at most 1 MiB, and warning URLs compress well.
 */
export class FirestoreStateStore implements StateStore {
  readonly kind = 'firestore';

  constructor(
    private readonly db: Firestore,
    private readonly now: () => number = Date.now,
    private readonly collection = 'serverState',
  ) {}

  async get<T>(name: string): Promise<T | null> {
    const snapshot = await this.db.collection(this.collection).doc(name).get();
    const data: unknown = snapshot.get('data');
    if (data === undefined) return null;
    // A document that can't be decoded (edited by hand, damaged) is not a read failure: it comes
    // back as a value every reader refuses, so the notifier warms up and the next save replaces
    // it. Throwing would fail every run, and never overwrite it, until someone deleted it.
    try {
      if (!(data instanceof Uint8Array)) throw new TypeError('not bytes');
      return JSON.parse(gunzipSync(data).toString('utf8')) as T;
    } catch {
      return UNREADABLE as T;
    }
  }

  async put(name: string, value: unknown): Promise<void> {
    const data = gzipSync(JSON.stringify(value));
    await this.db.collection(this.collection).doc(name).set({ data, updatedAt: this.now() });
  }

  async lease(name: string, holder: string, ttlMs: number): Promise<boolean> {
    const ref = this.db.collection(this.collection).doc(`lease-${name}`);
    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const current = snapshot.data() as { holder?: string; until?: number } | undefined;
      const now = this.now();
      if (current?.holder && current.holder !== holder && (current.until ?? 0) > now) return false;
      tx.set(ref, { holder, until: now + ttlMs });
      return true;
    });
  }

  async release(name: string, holder: string): Promise<void> {
    const ref = this.db.collection(this.collection).doc(`lease-${name}`);
    await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.get('holder') === holder) tx.delete(ref);
    });
  }
}

const USAGE = 'provider-usage';

/**
 * Keeps provider usage in the store, so a restart can't reset the budget: read back at start,
 * saved every `intervalMs` (a minute: 1,440 small writes a day, within Firestore's free
 * 20,000) and by `save()` at shutdown. Nothing is saved until the saved counts were read back:
 * saving before that would replace the last day's counts with the few since the start. Until
 * then each tick tries to read them again.
 */
export function persistUsage(store: StateStore, metrics: Metrics, logger: Logger, intervalMs = 60_000) {
  let restored = false;
  // One read at a time: counts are added, so two reads both succeeding would double them.
  let restoring: Promise<void> | null = null;
  const restore = () =>
    (restoring ??= store
      .get(USAGE)
      .then((saved) => {
        metrics.restoreUsage(saved);
        restored = true;
      })
      .catch((err: unknown) => logger.warn({ err }, 'could not restore provider usage'))
      .finally(() => {
        restoring = null;
      }));
  const save = async () => {
    if (!restored) return;
    await store
      .put(USAGE, metrics.exportUsage())
      .catch((err: unknown) => logger.warn({ err }, 'could not save provider usage'));
  };
  const ready = restore();
  const timer = setInterval(() => void (restored ? save() : restore()), intervalMs);
  timer.unref();
  return {
    /** Settles once the first attempt to read the saved counts has. */
    ready,
    save,
    stop: () => clearInterval(timer),
  };
}
