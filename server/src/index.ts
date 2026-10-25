import 'dotenv/config';
import { createApp } from './app.js';
import { OpenMeteoProvider } from './providers/openMeteo.js';
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

const service = new WeatherService(new OpenMeteoProvider(), ttlSeconds * 1000);
const app = createApp(service, corsOrigins);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
