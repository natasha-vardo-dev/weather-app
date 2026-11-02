/**
 * Just enough IndexedDB for the push storage: one database, one key-value store, get, put and
 * delete in a transaction that completes after its requests. Callbacks run asynchronously, as
 * in browsers, so code must set its handlers right after the calls.
 */
export function memoryIndexedDB() {
  const data = new Map<string, unknown>();
  const later = (run: () => void) => setTimeout(run, 0);
  function transaction() {
    const tx: { oncomplete?: () => void; onerror?: () => void; onabort?: () => void; objectStore: () => unknown } = {
      objectStore: () => store,
    };
    const complete = () => later(() => tx.oncomplete?.());
    const store = {
      get(key: string) {
        const request: { result?: unknown; onsuccess?: () => void } = {};
        later(() => {
          request.result = data.get(key);
          request.onsuccess?.();
          complete();
        });
        return request;
      },
      put(value: unknown, key: string) {
        data.set(key, value);
        complete();
        return {};
      },
      delete(key: string) {
        data.delete(key);
        return {};
      },
    };
    return tx;
  }
  return {
    data,
    open() {
      const request: { result: unknown; onsuccess?: () => void; onupgradeneeded?: () => void } = {
        result: { transaction, close: () => {}, createObjectStore: () => {} },
      };
      later(() => request.onsuccess?.());
      return request;
    },
  };
}
