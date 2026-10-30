import { expect, test } from './fixtures';

// The dark theme has its own colours: the contrast is checked there too.
test.use({ colorScheme: 'dark' });

test('the dark theme passes the same checks', async ({ page, checkA11y }) => {
  await page.goto('/weather/756135-warsaw');
  await expect(page.locator('.now__temp')).toContainText('12°');
  await checkA11y('city page, dark');

  await page.getByRole('combobox', { name: 'Search for a city' }).fill('war');
  await expect(page.getByRole('option')).toHaveCount(2);
  await checkA11y('search suggestions, dark');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Settings' }).click();
  await checkA11y('settings open, dark');
});
