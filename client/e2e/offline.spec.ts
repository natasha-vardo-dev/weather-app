import type { Page } from '@playwright/test';
import { forecast, warsaw } from '../tests/fixtures/weather';
import { expect, test } from './fixtures';

// The real service worker of the build: what it saved is what these tests are about.
test.use({ serviceWorkers: 'allow' });

const CITY = '/weather/756135-warsaw';

/**
 * Opens the city with the service worker in control, so the API answers go through it and are
 * saved (the first load, before the worker took over, saves nothing).
 */
async function openWithSavedCopy(page: Page) {
  await page.goto(CITY);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve));
    }
  });
  await page.reload();
  await expect(page.locator('.now__temp')).toContainText('12°');
}

test('offline, the city opens from what was saved, with a banner saying it may be old', async ({ page, checkA11y }) => {
  await openWithSavedCopy(page);

  await page.context().setOffline(true);
  await page.reload();

  await expect(page.getByText("You're offline. Showing the last loaded forecast")).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Warsaw');
  await expect(page.locator('.now__temp')).toContainText('12°');
  await checkA11y('offline with a saved forecast');
  await page.context().setOffline(false);
});

test('with the API down behind the site, the saved forecast is shown instead of an error', async ({ page }) => {
  await openWithSavedCopy(page);

  // What the site's proxy answers when the API does not: its own page, no API error body.
  await page
    .context()
    .route('**/api/v1/forecast?**', (route) =>
      route.fulfill({ status: 502, contentType: 'text/html', body: '<html>502 Bad Gateway</html>' }),
    );
  await page.reload();

  // The connection works, only our server does not: the banner says so, not "offline".
  await expect(page.getByText("The weather server isn't responding. Showing the last loaded forecast")).toBeVisible();
  await expect(page.getByText("You're offline.")).toHaveCount(0);
  await expect(page.locator('.now__temp')).toContainText('12°');
});

test('with the API down and nothing saved, the page says the server is not responding', async ({ page }) => {
  await page
    .context()
    .route('**/api/v1/forecast?**', (route) =>
      route.fulfill({ status: 502, contentType: 'text/html', body: '<html>502 Bad Gateway</html>' }),
    );
  await page.goto(CITY);

  await expect(page.getByText("The weather server isn't responding.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('a forecast over an hour old says when it was last updated', async ({ page, checkA11y }) => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await page
    .context()
    .route('**/api/v1/forecast?**', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(forecast(warsaw, { now: twoHoursAgo })) }),
    );
  await page.goto(CITY);

  await expect(page.getByText('Forecast last updated:')).toBeVisible();
  await checkA11y('outdated forecast notice');
});
