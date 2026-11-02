import type { Page, Route } from '@playwright/test';
import type { Location } from '@weather/shared';
import { airQuality, forecast, krakow, noAlerts, warsaw, warsawSuburb } from '../tests/fixtures/weather';

export const PLACES: Location[] = [warsaw, warsawSuburb, krakow];

/** Places by the language they are asked in: the search and /locations/:id localize names. */
const NAMES: Record<string, Record<number, Pick<Location, 'name' | 'country'>>> = {
  de: { [warsaw.id]: { name: 'Warschau', country: 'Polen' }, [krakow.id]: { name: 'Krakau', country: 'Polen' } },
};

function inLanguage(place: Location, language: string | null): Location {
  return { ...place, ...NAMES[language ?? 'en']?.[place.id] };
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const notFound = (route: Route) => json(route, { error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);

/**
 * Answers every /api request with fixtures, as the server would. Returns the requests nothing
 * here knows, so a test fails on a call it did not expect instead of quietly getting an error.
 * Routed on the browser context, not the page: with the service worker allowed (offline tests)
 * its requests are the context's, and a page route would not see them.
 */
export async function mockApi(page: Page): Promise<{ unexpected: string[] }> {
  const unexpected: string[] = [];
  await page.context().route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    const params = url.searchParams;
    const path = url.pathname;

    if (path === '/api/v1/locations') {
      const q = (params.get('q') ?? '').toLowerCase();
      const found = PLACES.map((p) => inLanguage(p, params.get('lang'))).filter((p) =>
        p.name.toLowerCase().startsWith(q),
      );
      return json(route, { locations: found });
    }
    const byId = path.match(/^\/api\/v1\/locations\/(\d+)$/);
    if (byId) {
      const place = PLACES.find((p) => p.id === Number(byId[1]));
      return place ? json(route, inLanguage(place, params.get('lang'))) : notFound(route);
    }
    if (path === '/api/v1/forecast') {
      return json(route, forecast({ latitude: Number(params.get('lat')), longitude: Number(params.get('lon')) }));
    }
    if (path === '/api/v1/forecasts') {
      const places = (params.get('places') ?? '').split(';').map((pair) => pair.split(',').map(Number));
      return json(route, {
        forecasts: places.map(([latitude, longitude]) => ({
          forecast: forecast({ latitude: latitude!, longitude: longitude! }),
        })),
      });
    }
    if (path === '/api/v1/air-quality') return json(route, airQuality());
    if (path === '/api/v1/alerts') return json(route, noAlerts);
    // The browser's position names Warsaw when it is there (geolocation.spec.ts), nothing elsewhere.
    if (path === '/api/v1/places/reverse') {
      const near = (value: string | null, target: number) => Math.abs(Number(value) - target) < 0.1;
      return near(params.get('lat'), warsaw.latitude) && near(params.get('lon'), warsaw.longitude)
        ? json(route, inLanguage(warsaw, params.get('lang')))
        : notFound(route);
    }
    // The IP address points to Kraków.
    if (path === '/api/v1/places/approximate') return json(route, inLanguage(krakow, params.get('lang')));

    unexpected.push(`${route.request().method()} ${path}`);
    return json(route, { error: { code: 'INTERNAL', message: 'Not mocked' } }, 500);
  });
  return { unexpected };
}
