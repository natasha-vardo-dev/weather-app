import 'dotenv/config';
import { createApp } from './app.js';
import { NominatimGeocoder } from './providers/nominatim.js';
import { OpenMeteoProvider } from './providers/openMeteo.js';
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
const app = createApp(service, corsOrigins, places);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
