/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { API_PREFIX } from '@weather/shared';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { deleteOldApiCaches } from './src/sw/deleteOldApiCaches.ts';
import { splitForecastBatch } from './src/sw/splitForecastBatch.ts';
import vercel from './vercel.json' with { type: 'json' };

const proxy = {
  '/api': 'http://localhost:3001',
};

const DAY_SECONDS = 24 * 60 * 60;

/** The service worker's cache of API answers, one per API version: "api-v1". */
const API_CACHE = `api-${API_PREFIX.split('/').pop()}`;

/**
 * The security headers Vercel sends (vercel.json, the one place they are written), sent by
 * `vite preview` too: the end-to-end tests run on it and fail on any console error, which a
 * Content-Security-Policy violation is, so every scenario checks the policy. Not in
 * `npm run dev`: its hot reloading needs inline scripts and a websocket the policy forbids.
 */
const securityHeaders = Object.fromEntries(
  vercel.headers.find((rule) => rule.source === '/(.*)')!.headers.map(({ key, value }) => [key, value]),
);

export default defineConfig({
  define: {
    // Which build sent an error report (errorReporting.ts): Vercel builds from a commit.
    __RELEASE__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'),
  },
  plugins: [
    react(),
    VitePWA({
      // A new version activates in the background and is used from the next visit:
      // nothing in the page is worth a "Reload to update" prompt (and its 19 translations).
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      // Icons and their <link> tags are generated from public/logo.svg (pwa-assets.config.ts).
      pwaAssets: { config: true, overrideManifestIcons: true, injectThemeColor: false },
      manifest: {
        id: '/',
        name: 'Weather forecast',
        short_name: 'Weather',
        description: 'Current weather and a 10-day forecast for any place.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#3468a0',
        background_color: '#3468a0',
      },
      workbox: {
        // A new worker takes over at once, so the next page load runs the new build. Without
        // these (registerType alone sets them only with the plugin's virtual register module,
        // not with injectRegister: 'script-defer') it waited until every tab was closed: an
        // installed app that stays open, or one tab reloaded, kept the old code (and the old
        // API version it calls) for good. A page already open keeps its old code until reloaded.
        skipWaiting: true,
        clientsClaim: true,
        // The app shell is precached; any page URL opens it, as vercel.json does online. The
        // font files are part of the build (served from the site, not Google Fonts), so offline too.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Push notifications about weather warnings (public/push-sw.js).
        importScripts: ['push-sw.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Last forecasts, air quality and localized place names, for when the network fails
            // or stalls: a working network always wins, so the API's own cache rules stay in
            // charge. Error responses (502, 404) are returned but never stored. A saved copy is
            // marked with a header, so the page can say it may be out of date (api/savedResponses.ts).
            // Any API version (serialized into sw.js, so a literal, not API_PREFIX): a page still
            // on the old code asks the old one, under its own URLs.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /^\/api\/v\d+\/(forecasts?|air-quality|locations\/\d+)$/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              // Named after the version (api-v1), so a new one starts empty and the old is deleted.
              cacheName: API_CACHE,
              // A stalled request (weak signal) would otherwise hang until the browser gives up,
              // tens of seconds of skeleton. After this the saved copy is shown, if there is one
              // (without one Workbox keeps waiting); a late answer is still stored for next time.
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 50, maxAgeSeconds: DAY_SECONDS },
              cacheableResponse: { statuses: [200] },
              plugins: [
                {
                  // What the API marks no-store is not kept either: a partial batch of forecasts
                  // (one city failed) would otherwise replace the last complete copy, and that
                  // city would show an error offline instead of its last forecast. Returned to
                  // the page as usual. (Found by roborev.)
                  cacheWillUpdate: async ({ response }) =>
                    /no-store/.test(response.headers.get('Cache-Control') ?? '') ? null : response,
                },
                // Each forecast of a stored batch also under its city's own /forecast URL.
                { cacheDidUpdate: splitForecastBatch },
                // The previous version's cache (and the unversioned 'api' of before), once this one is used.
                { cacheDidUpdate: deleteOldApiCaches },
                {
                  // Serialized into sw.js: no outside references, so the header name is a
                  // literal (SAVED_RESPONSE_HEADER).
                  cachedResponseWillBeUsed: async ({ cachedResponse }) => {
                    if (!cachedResponse) return null;
                    const headers = new Headers(cachedResponse.headers);
                    headers.set('X-From-Cache', '1');
                    return new Response(cachedResponse.body, {
                      status: cachedResponse.status,
                      statusText: cachedResponse.statusText,
                      headers,
                    });
                  },
                },
              ],
            },
          },
        ],
      },
    }),
  ],
  // In development the API runs separately; the proxy keeps URLs identical to production,
  // where vercel.json rewrites /api to the backend.
  server: { proxy },
  preview: { proxy, headers: securityHeaders },
  // Logic tests run in Node; component tests (tests/components) in jsdom, as two Vitest
  // projects (environmentMatchGlobs, which did this by path, is gone since Vitest 3).
  // Playwright's end-to-end tests (e2e/) are run by Playwright, not Vitest.
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'logic',
          include: ['tests/**/*.test.{ts,tsx}'],
          exclude: ['tests/components/**'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'components',
          include: ['tests/components/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['tests/components/setup.ts'],
        },
      },
    ],
  },
});
