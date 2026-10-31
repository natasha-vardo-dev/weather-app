import { expect, test } from './fixtures';

test('the privacy policy opens from the footer', async ({ page, checkA11y }) => {
  await page.goto('/');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
  await expect(page).toHaveTitle(/^Privacy policy/);
  await checkA11y('privacy policy');
});

// The policy says no visitor's address goes to Google for the font: it comes from the site.
test('the font is served from the site itself', async ({ page }) => {
  const fontHosts = new Set<string>();
  page.on('request', (request) => {
    if (request.resourceType() === 'font') fontHosts.add(new URL(request.url()).host);
  });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  // fonts.check() is true for a family nothing declares too (taken as a system font), so ask
  // for a declared face of ours that actually loaded. (Found by roborev.)
  const loaded = await page.evaluate(() =>
    [...document.fonts].some(
      (f) => f.family.replace(/"/g, '') === 'Bricolage Grotesque Variable' && f.status === 'loaded',
    ),
  );
  expect(loaded).toBe(true);
  expect([...fontHosts]).toEqual([new URL(page.url()).host]);
});
