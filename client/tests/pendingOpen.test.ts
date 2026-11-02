import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { takePendingOpen } from '../src/push/pendingOpen';
import { memoryIndexedDB } from './memoryIndexedDB';

let db: ReturnType<typeof memoryIndexedDB>;
beforeEach(() => {
  db = memoryIndexedDB();
  vi.stubGlobal('indexedDB', db);
});
afterEach(() => vi.unstubAllGlobals());

const NOW = Date.parse('2026-11-02T12:00:00Z');

describe('takePendingOpen', () => {
  it('gives the recorded place once, and removes it', async () => {
    db.data.set('open', { path: '/weather/756135-warsaw', at: NOW - 5000 });
    expect(await takePendingOpen(120_000, NOW)).toBe('/weather/756135-warsaw');
    expect(db.data.has('open')).toBe(false);
    expect(await takePendingOpen(120_000, NOW)).toBeNull();
  });

  it('drops a record that is too old or not a path of this site, unused', async () => {
    for (const record of [
      { path: '/weather/756135-warsaw', at: NOW - 121_000 },
      { path: '//evil.example/x', at: NOW },
      { path: 'https://evil.example/', at: NOW },
      { path: '/weather/756135-warsaw' },
      'not an object',
    ]) {
      db.data.set('open', record);
      expect(await takePendingOpen(120_000, NOW)).toBeNull();
      expect(db.data.has('open')).toBe(false);
    }
  });

  it('gives nothing, without failing, when IndexedDB does', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('SecurityError');
      },
    });
    expect(await takePendingOpen()).toBeNull();
  });

  it('closes its connection on every way out, a failed transaction included', async () => {
    const close = vi.fn();
    const tx: { onerror?: () => void; objectStore: () => unknown } = {
      objectStore: () => ({
        get: () => {
          setTimeout(() => tx.onerror?.(), 0);
          return {};
        },
      }),
    };
    vi.stubGlobal('indexedDB', {
      open: () => {
        const request: { result: unknown; onsuccess?: () => void } = { result: { transaction: () => tx, close } };
        setTimeout(() => request.onsuccess?.(), 0);
        return request;
      },
    });
    expect(await takePendingOpen()).toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
