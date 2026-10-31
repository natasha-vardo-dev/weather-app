import { expect, test } from './fixtures';

test('switch to °F and to German, and keep both after a reload', async ({ page, checkA11y }) => {
  await page.goto('/weather/756135-warsaw');
  const temperature = page.locator('.now__temp');
  await expect(temperature).toContainText('12°');

  const gear = page.getByRole('button', { name: 'Settings' });
  await gear.click();
  await expect(gear).toHaveAttribute('aria-expanded', 'true');
  await checkA11y('settings open');

  await page.getByRole('button', { name: '°F' }).click();
  await expect(page.getByRole('button', { name: '°F' })).toHaveAttribute('aria-pressed', 'true');
  // 12.4 °C = 54 °F; the whole page follows.
  await expect(temperature).toContainText('54°');

  await page.getByRole('button', { name: /Language/ }).click();
  await expect(page.getByRole('listbox', { name: 'Language' })).toBeFocused();
  await checkA11y('language list');
  await page.getByRole('option', { name: 'Deutsch' }).click();

  // Back in the panel, now in German; the place name follows the language too.
  await expect(page.getByRole('button', { name: /Sprache/ })).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Warschau');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Einstellungen' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Einstellungen' })).toHaveAttribute('aria-expanded', 'false');

  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Stadt suchen' })).toBeVisible();
  await expect(temperature).toContainText('54°');
  await checkA11y('city page in German, °F');
});
