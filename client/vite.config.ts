import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const proxy = {
  '/api': 'http://localhost:3001',
};

const DAY_SECONDS = 24 * 60 * 60;

export default defineConfig({
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
        // The app shell is precached; any page URL opens it, as vercel.json does online.
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
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
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /^\/api\/(forecast|air-quality|locations\/\d+)$/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api',
              // A stalled request (weak signal) would otherwise hang until the browser gives up,
              // tens of seconds of skeleton. After this the saved copy is shown, if there is one
              // (without one Workbox keeps waiting); a late answer is still stored for next time.
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 50, maxAgeSeconds: DAY_SECONDS },
              cacheableResponse: { statuses: [200] },
              plugins: [
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
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            // Font files are immutable (the URL changes with the version).
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 365 * DAY_SECONDS },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  // In development the API runs separately; the proxy keeps URLs identical to production,
  // where vercel.json rewrites /api to the backend.
  server: { proxy },
  preview: { proxy },
});
