import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteOldApiCaches } from '../src/sw/deleteOldApiCaches';

const names = new Set<string>();
vi.stubGlobal('caches', {
  keys: async () => [...names],
  delete: async (name: string) => names.delete(name),
});
afterEach(() => names.clear());

describe('deleteOldApiCaches', () => {
  it("deletes other API versions' caches, the unversioned one and Google Fonts', keeping everything else", async () => {
    const all = [
      'api',
      'api-v1',
      'api-v2',
      'google-fonts',
      'google-fonts-css',
      'workbox-precache-v2-https://weather.test/',
    ];
    for (const name of all) names.add(name);
    await deleteOldApiCaches({ cacheName: 'api-v2' });
    expect([...names]).toEqual(['api-v2', 'workbox-precache-v2-https://weather.test/']);
  });
});
