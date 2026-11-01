import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { AlertNotifier } from '../src/services/alertNotifier.js';
import { FirestoreStateStore, UNREADABLE } from '../src/services/stateStore.js';

/** Just enough of Firestore for the store: documents by path, transactions run at once. */
function fakeFirestore() {
  const docs = new Map<string, Record<string, unknown>>();
  const snapshot = (path: string) => ({
    get: (field: string) => docs.get(path)?.[field],
    data: () => docs.get(path),
  });
  const ref = (collection: string, id: string) => ({
    path: `${collection}/${id}`,
    get: async () => snapshot(`${collection}/${id}`),
    set: async (data: Record<string, unknown>) => void docs.set(`${collection}/${id}`, data),
  });
  const db = {
    collection: (collection: string) => ({ doc: (id: string) => ref(collection, id) }),
    runTransaction: async <T>(work: (tx: unknown) => Promise<T>) =>
      work({
        get: async (r: { path: string }) => snapshot(r.path),
        set: (r: { path: string }, data: Record<string, unknown>) => void docs.set(r.path, data),
        delete: (r: { path: string }) => void docs.delete(r.path),
      }),
  };
  return { db: db as unknown as Firestore, docs };
}

describe('FirestoreStateStore', () => {
  it('round-trips a document, stored gzipped as bytes', async () => {
    const { db, docs } = fakeFirestore();
    const store = new FirestoreStateStore(db, () => 1000);
    expect(await store.get('state')).toBeNull();
    const value = { seen: [['https://feeds.meteoalarm.org/x', 5]], warmed: ['PL'] };
    await store.put('state', value);
    expect(await store.get('state')).toEqual(value);
    const stored = docs.get('serverState/state')!;
    expect(stored.data).toBeInstanceOf(Uint8Array);
    expect(stored.updatedAt).toBe(1000);
  });

  it('gives the lease to one holder until it runs out, and lets only that holder release it', async () => {
    let now = 0;
    const { db } = fakeFirestore();
    const store = new FirestoreStateStore(db, () => now);
    expect(await store.lease('run', 'a', 1000)).toBe(true);
    expect(await store.lease('run', 'b', 1000)).toBe(false);
    expect(await store.lease('run', 'a', 1000)).toBe(true); // renewed by its holder
    await store.release('run', 'b');
    expect(await store.lease('run', 'b', 1000)).toBe(false);
    now = 1001;
    expect(await store.lease('run', 'b', 1000)).toBe(true);
    await store.release('run', 'b');
    expect(await store.lease('run', 'a', 1000)).toBe(true);
  });

  it('hands back a damaged document as unreadable, so the notifier warms up and replaces it', async () => {
    const { db, docs } = fakeFirestore();
    const store = new FirestoreStateStore(db, () => 0);
    docs.set('serverState/alert-notifier', { data: new Uint8Array([1, 2, 3]) });
    expect(await store.get('alert-notifier')).toBe(UNREADABLE);
    docs.set('serverState/other', { data: 'text' });
    expect(await store.get('other')).toBe(UNREADABLE);

    const notifier = new AlertNotifier(
      {
        areasAt: async () => [],
        listWarnings: async () => ({ warnings: [], read: ['PL'], failed: [] }),
        loadWarning: async () => null,
      },
      { subscribe: async () => {}, unsubscribe: async () => {}, send: async () => ({ accepted: 0, rejected: 0 }) },
      () => 0,
      { store },
    );
    expect(await notifier.run()).toMatchObject({ warmUp: true });
    expect(await store.get('alert-notifier')).toMatchObject({ version: 1, warmed: ['PL'] });
  });
});
