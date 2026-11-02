import { expect, test } from './fixtures';

test.describe('with location allowed', () => {
  test.use({ geolocation: { latitude: 52.2297, longitude: 21.0118 }, permissions: ['geolocation'] });

  test('the crosshair opens the city the user is in, marked as where they are', async ({ page, checkA11y }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Use my location' }).click();

    // The city as search would find it (its id in the address), not the bare position.
    await expect(page).toHaveURL('/weather/756135-warsaw');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Warsaw');
    await expect(page.locator('#now-title').getByText('You are here')).toBeVisible();
    await checkA11y('city opened by location');
  });
});

test('location blocked: says how to allow it, and does not guess the city from the address', async ({
  page,
  checkA11y,
}) => {
  // No permission granted: the browser refuses the position.
  const approximate: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/places/approximate')) approximate.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Use my location' }).click();

  await expect(page.getByRole('alert')).toContainText('Location access is blocked.');
  await checkA11y('location blocked');
  // The user said no to sharing their location; guessing it anyway would go around that.
  await expect(page.getByRole('button', { name: /Looks like you're in/ })).toHaveCount(0);
  expect(approximate).toEqual([]);
});

test('location not found: offers the city guessed from the address, opened only on request', async ({
  page,
  checkA11y,
}) => {
  // The device has no fix (no GPS, Wi-Fi positioning off): POSITION_UNAVAILABLE.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) =>
          fail({ code: 2, message: 'Position unavailable', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }),
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Use my location' }).click();

  await expect(page.getByRole('alert')).toContainText("Couldn't find your location.");
  const suggestion = page.getByRole('button', { name: "Looks like you're in Kraków" });
  await expect(suggestion).toBeVisible();
  await checkA11y('location not found, city suggested');

  // Offered, not opened: behind a VPN the guess can be another city.
  await expect(page).toHaveURL('/');
  await suggestion.click();
  await expect(page).toHaveURL('/weather/3094802-krakow');
  await expect(page.locator('#now-title').getByText('Approximate, by IP')).toBeVisible();
});
