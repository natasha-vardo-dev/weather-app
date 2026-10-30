import { defineConfig, devices } from '@playwright/test';

const PORT = 4180;

/**
 * End-to-end tests: the production build in a real browser, with /api answered by fixtures
 * in the browser (e2e/mockApi.ts). The server is covered by its own tests (Supertest); here
 * the point is the interface, and real Open-Meteo would make runs slow, flaky and costly in
 * the provider's quota.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // English with day-month dates and °C, in the fixtures' time zone, whatever the machine.
    locale: 'en-GB',
    timezoneId: 'Europe/Warsaw',
    // The service worker would answer /api from its own cache, past the mocks.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // The same scenarios on a phone-sized screen: the layout changes below 480 px.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx vite build --logLevel warn && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
