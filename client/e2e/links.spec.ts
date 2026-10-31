import { expect, test } from './fixtures';

test('a shared link opens the city with its forecast', async ({ page, checkA11y }) => {
  await page.goto('/weather/756135-warsaw');

  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toContainText('Warsaw');
  await expect(heading).toContainText('Poland');
  await expect(page.getByText('Masovian Voivodeship')).toBeVisible();
  await expect(page.locator('.now__temp')).toContainText('12°');
  // The next 24 hours and 10 days.
  await expect(page.getByText('Now', { exact: true })).toBeVisible();
  await expect(page.getByText('Today', { exact: true })).toBeVisible();
  await checkA11y('city opened by link');

  // Details open a chart below the tiles.
  const humidity = page.getByRole('button', { name: /Humidity/ });
  await humidity.click();
  await expect(humidity).toHaveAttribute('aria-expanded', 'true');
  await checkA11y('humidity chart open');

  // A tile under the mouse: lighter, and its soft texts must still read (4.1:1 once, found by
  // axe in CI when, on a phone, the finger's hover stuck to the UV tile).
  await page.getByRole('button', { name: /UV/ }).hover();
  await checkA11y('tile under the mouse');
});

test('a link made in another language, or edited, moves to the canonical address', async ({ page }) => {
  await page.goto('/weather/756135-varshava');
  await expect(page).toHaveURL('/weather/756135-warsaw');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Warsaw');

  // Replaced, not added: Back leaves the site's history instead of returning to the old link.
  await page.goto('/');
  await page.goto('/weather/756135-Warsaw');
  await expect(page).toHaveURL('/weather/756135-warsaw');
  await page.goBack();
  await expect(page).toHaveURL('/');
});

test('an unknown city or a broken link says so', async ({ page, checkA11y }) => {
  await page.goto('/weather/999999-nowhere');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing here');
  await checkA11y('unknown city');

  await page.goto('/weather/abc');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing here');
  await page.getByRole('link', { name: 'Go to the start page' }).click();
  await expect(page).toHaveURL('/');
});
