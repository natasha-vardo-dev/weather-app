/**
 * The place a tapped warning notification asked to open, as the service worker recorded it
 * (public/push-sw.js, `recordOpen`): read and removed in one transaction, so it is used once.
 * Older than `maxAgeMs`, or not a path of this site, it is dropped unused: stored data is
 * input like any other. Null when there is none or IndexedDB fails; never rejects.
 */
export function takePendingOpen(maxAgeMs = 2 * 60 * 1000, now = Date.now()): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open('weather-push', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('kv');
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        const db = open.result;
        db.onversionchange = () => db.close();
        let found: unknown = null;
        const done = () => {
          const { path, at } = (found ?? {}) as { path?: unknown; at?: unknown };
          const valid =
            typeof path === 'string' &&
            path.startsWith('/') &&
            !path.startsWith('//') &&
            typeof at === 'number' &&
            now - at <= maxAgeMs;
          resolve(valid ? path : null);
          db.close();
        };
        try {
          const tx = db.transaction('kv', 'readwrite');
          const store = tx.objectStore('kv');
          const get = store.get('open');
          get.onsuccess = () => {
            found = get.result ?? null;
            if (found !== null) store.delete('open');
          };
          tx.oncomplete = done;
          // Every way out closes the connection: an open one would block a later version of the database.
          const failed = () => {
            resolve(null);
            db.close();
          };
          tx.onerror = failed;
          tx.onabort = failed;
        } catch {
          resolve(null);
          db.close();
        }
      };
    } catch {
      resolve(null);
    }
  });
}

/**
 * TEMPORARY, for the iPhone case: adds a page event to the on-device trace the service worker
 * also writes (public/push-sw.js, `trace`). The last 30 of the last 7 days kept; never sent;
 * never rejects. When the trace goes, a one-off delete of the `trace` key must replace it
 * (here, in takePendingOpen's transaction), or entries stay on devices for good.
 */
export function tracePage(message: string, detail?: unknown): Promise<void> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open('weather-push', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('kv');
      open.onerror = () => resolve();
      open.onsuccess = () => {
        const db = open.result;
        db.onversionchange = () => db.close();
        const done = () => {
          resolve();
          db.close();
        };
        try {
          const tx = db.transaction('kv', 'readwrite');
          const store = tx.objectStore('kv');
          const get = store.get('trace');
          // Done once the write is queued: close() lets the transaction finish first.
          get.onsuccess = () => {
            try {
              const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
              const entries = (Array.isArray(get.result) ? (get.result as { at?: unknown }[]) : []).filter(
                (entry) => typeof entry?.at === 'number' && entry.at >= week,
              );
              entries.push({ at: Date.now(), who: 'page', message, detail: detail ?? null } as { at: number });
              store.put(entries.slice(-30), 'trace');
            } catch {
              // A trace is never worth a failure.
            }
            done();
          };
          get.onerror = done;
          tx.oncomplete = done;
          tx.onerror = done;
          tx.onabort = done;
        } catch {
          done();
        }
      };
    } catch {
      resolve();
    }
  });
}
