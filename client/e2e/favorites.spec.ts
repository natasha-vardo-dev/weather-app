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

test('the start page loads every saved city in one request', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'favorites:v1',
      JSON.stringify([
        { id: 756135, name: 'Warsaw', country: 'Poland', latitude: 52.23, longitude: 21.01 },
        { id: 3094802, name: 'Kraków', country: 'Poland', latitude: 50.06, longitude: 19.94 },
      ]),
    ),
  );
  const forecastRequests: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/api/v1/forecast')) forecastRequests.push(pathname);
  });

  await page.goto('/');
  await expect(page.getByRole('link', { name: /Warsaw/ })).toContainText('12°');
  await expect(page.getByRole('link', { name: /Kraków/ })).toContainText('12°');
  expect(forecastRequests).toEqual(['/api/v1/forecasts']);
});

test('the city page loads its own forecast alone, the strip of saved cities as one batch', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'favorites:v1',
      JSON.stringify([
        { id: 756135, name: 'Warsaw', country: 'Poland', latitude: 52.23, longitude: 21.01 },
        { id: 3094802, name: 'Kraków', country: 'Poland', latitude: 50.06, longitude: 19.94 },
        { id: 3096472, name: 'Warsaw', country: 'United States', latitude: 41.24, longitude: -85.85 },
      ]),
    ),
  );
  const forecastRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/forecast') forecastRequests.push(`forecast ${url.searchParams.get('lat')}`);
    if (url.pathname === '/api/v1/forecasts') forecastRequests.push(`forecasts ${url.searchParams.get('places')}`);
  });

  await page.goto('/weather/3094802-krakow');
  await expect(page.locator('.now__temp')).toContainText('12°');
  await expect(page.getByRole('link', { name: /Warsaw/ }).first()).toContainText('12°');
  // Kraków (the page) on its own, not waiting for the others; the other two together.
  expect(forecastRequests.sort()).toEqual(['forecast 50.06', 'forecasts 52.23,21.01;41.24,-85.85']);
});
