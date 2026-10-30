import { expect, test } from './fixtures';

test('search, open a city and add it to favourites', async ({ page, checkA11y }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("What's the weather where you're going?");
  await checkA11y('start page');

  const search = page.getByRole('combobox', { name: 'Search for a city' });
  await search.fill('war');
  // Two Warsaws, told apart by country.
  await expect(page.getByRole('option')).toHaveCount(2);
  await checkA11y('search suggestions');
  await page.getByRole('option', { name: /Warsaw.*Poland/ }).click();

  // One address per city: id and an English slug.
  await expect(page).toHaveURL('/weather/756135-warsaw');
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toContainText('Warsaw');
  await expect(heading).toContainText('Poland');
  await expect(page.getByText('3° warmer than yesterday')).toBeVisible();
  await expect(page).toHaveTitle(/Warsaw/);
  await checkA11y('city page');

  await page.getByRole('button', { name: 'Add to favourites' }).click();
  await expect(page.getByRole('button', { name: 'Remove from favourites' })).toBeVisible();

  // Back to the start page by the logo: the city is there as a card, with its weather.
  await page.getByRole('link', { name: 'Weather' }).click();
  await expect(page).toHaveURL('/');
  const card = page.getByRole('link', { name: /Warsaw/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText('12°');
  await checkA11y('start page with a favourite');

  // Kept in the browser, so still there after a reload.
  await page.reload();
  await expect(page.getByRole('link', { name: /Warsaw/ })).toBeVisible();

  // The card opens the city, already saved.
  await page.getByRole('link', { name: /Warsaw/ }).click();
  await expect(page).toHaveURL('/weather/756135-warsaw');
  await expect(page.getByRole('button', { name: 'Remove from favourites' })).toBeVisible();
});

test('choose a city with the keyboard', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('combobox', { name: 'Search for a city' });
  await search.fill('kra');
  await expect(page.getByRole('option', { name: /Kraków/ })).toHaveAttribute('aria-selected', 'true');
  await search.press('Enter');
  await expect(page).toHaveURL('/weather/3094802-krakow');
  // Focus moves to the city's name, so screen readers announce the new page.
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
});
