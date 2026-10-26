import 'dotenv/config';
import { createApp } from './app.js';
import { IpWhoIsLocator } from './providers/ipwhois.js';
import { NominatimGeocoder } from './providers/nominatim.js';
import { OpenMeteoProvider } from './providers/openMeteo.js';
import { ApproximateLocationService } from './services/approximateService.js';
import { PlaceService } from './services/placeService.js';
import { WeatherService } from './services/weatherService.js';

/**
 * A positive number from the environment, or the default when unset or empty. Anything
 * else stops the server: an empty or mistyped value used to give 0 (no cache, every
 * request to the rate-limited provider) or NaN (cached forecasts never expiring).
 */
function positiveNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}"`);
  }
  return value;
}

const port = positiveNumber('PORT', 3001);
const ttlSeconds = positiveNumber('FORECAST_CACHE_TTL', 600);
const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Nominatim's policy asks for an identifying User-Agent with a way to reach the app's author.
const nominatimUserAgent =
  process.env.NOMINATIM_USER_AGENT?.trim() || 'weather-app/1.0 (+https://github.com/natasha-vardo-dev/weather-app)';

const service = new WeatherService(new OpenMeteoProvider(), ttlSeconds * 1000);
// Matches the user's location to a searched city through the weather service's cached search.
const places = new PlaceService(new NominatimGeocoder({ userAgent: nominatimUserAgent }), service);
// Proxies in front of the server that may set X-Forwarded-For (Vercel and Render: 2).
// Only these are trusted; otherwise anyone could fake their address in the header.
const trustProxy = process.env.TRUST_PROXY?.trim() ? positiveNumber('TRUST_PROXY', 1) : false;
// Locally the request comes from localhost, so the machine's own public address is looked
// up instead. Opt-in (IP_SELF_LOOKUP=1 in the local .env only): on by default, a server
// whose proxy setup is wrong would offer its data centre's city to every user.
const approximate = new ApproximateLocationService(
  new IpWhoIsLocator(),
  places,
  process.env.IP_SELF_LOOKUP?.trim() === '1',
);
const app = createApp(service, corsOrigins, places, approximate, trustProxy);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
