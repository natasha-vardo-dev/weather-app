import 'dotenv/config';
import { createApp } from './app.js';
import { ALERTS_FEED_TTL_SECONDS } from '@weather/shared';
import { IpWhoIsLocator } from './providers/ipwhois.js';
import { FcmSender } from './providers/fcm.js';
import { MeteoAlarmProvider } from './providers/meteoAlarm.js';
import { NominatimGeocoder } from './providers/nominatim.js';
import { OpenMeteoProvider } from './providers/openMeteo.js';
import { AlertNotifier } from './services/alertNotifier.js';
import { AlertService } from './services/alertService.js';
import { ApproximateLocationService } from './services/approximateService.js';
import { PlaceService } from './services/placeService.js';
import { loadRegions, RegionIndex } from './services/regions.js';
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
// Official warnings (Europe). Region borders: data/meteoalarm-regions.json.gz, built by
// scripts/buildAlertRegions.ts from MeteoAlarm's published file; read on first request.
const regionsFile = new URL('../data/meteoalarm-regions.json.gz', import.meta.url);
const meteoAlarm = new MeteoAlarmProvider({
  regions: async () => new RegionIndex((await loadRegions(regionsFile)).regions),
  feedTtlMs: ALERTS_FEED_TTL_SECONDS * 1000,
});
const alerts = new AlertService(meteoAlarm);

/**
 * Push notifications about warnings, if configured: FIREBASE_SERVICE_ACCOUNT is the service
 * account's JSON key (plain or base64), a secret; ALERTS_NOTIFY_SECRET guards the endpoint the
 * external scheduler calls. Without them the rest of the app works as before.
 */
function serviceAccount(): Record<string, string> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  return JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
}
const account = serviceAccount();
const notifySecret = process.env.ALERTS_NOTIFY_SECRET?.trim() || undefined;
const push = account
  ? (() => {
      const sender = new FcmSender(account);
      return { source: meteoAlarm, sender, notifier: new AlertNotifier(meteoAlarm, sender), notifySecret };
    })()
  : undefined;

const app = createApp(service, corsOrigins, places, approximate, trustProxy, alerts, push);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
