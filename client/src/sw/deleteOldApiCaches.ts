/**
 * Workbox `cacheDidUpdate` for the API route: deletes the caches of other API versions (and
 * the unversioned 'api' used before versions), once an answer has been stored in this one.
 * A new API version is a new URL, so the old cache would only take space: its answers are
 * never asked for again. Also the Google Fonts caches of before the font was served from the
 * site itself (privacy: no visitor's address goes to Google). Runs on each stored answer;
 * listing the caches costs next to nothing.
 *
 * Serialized into sw.js by vite-plugin-pwa: no outside references, only the arguments and
 * service-worker globals.
 */
export async function deleteOldApiCaches({ cacheName }: { cacheName: string }): Promise<void> {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name !== cacheName && /^(api(-v\d+)?|google-fonts(-css)?)$/.test(name))
      .map((name) => caches.delete(name)),
  );
}
