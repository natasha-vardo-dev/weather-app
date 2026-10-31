import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteOldApiCaches } from '../src/sw/deleteOldApiCaches';

const names = new Set<string>();
vi.stubGlobal('caches', {
  keys: async () => [...names],
  delete: async (name: string) => names.delete(name),
});
afterEach(() => names.clear());

describe('deleteOldApiCaches', () => {
  it("deletes other API versions' caches and the unversioned one, keeping everything else", async () => {
    for (const name of ['api', 'api-v1', 'api-v2', 'google-fonts', 'workbox-precache-v2-https://weather.test/']) {
      names.add(name);
    }
    await deleteOldApiCaches({ cacheName: 'api-v2' });
    expect([...names]).toEqual(['api-v2', 'google-fonts', 'workbox-precache-v2-https://weather.test/']);
  });
});
