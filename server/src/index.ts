import 'dotenv/config';
import { createApp } from './app.js';
import { ALERTS_FEED_TTL_SECONDS } from '@weather/shared';
import { IpWhoIsLocator } from './providers/ipwhois.js';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FcmSender } from './providers/fcm.js';
import { MeteoAlarmProvider } from './providers/meteoAlarm.js';
import { NominatimGeocoder } from './providers/nominatim.js';
import { OpenMeteoProvider } from './providers/openMeteo.js';
import { AlertNotifier } from './services/alertNotifier.js';
import { AlertService } from './services/alertService.js';
import { ApproximateLocationService } from './services/approximateService.js';
import { PlaceService } from './services/placeService.js';
import { loadRegions, RegionIndex } from './services/regions.js';
import { FirestoreStateStore, MemoryStateStore, persistUsage, type StateStore } from './services/stateStore.js';
import { WeatherService } from './services/weatherService.js';
import { createLogger } from './observability/logger.js';
import {
  instrumentFetch,
  IPWHOIS_LIMITS,
  Metrics,
  OPEN_METEO_LIMITS,
  openMeteoWeight,
} from './observability/metrics.js';
import { loadConfig } from './config.js';
import { DEFAULT_RATE_LIMITS } from './rateLimits.js';
import { gracefulShutdown } from './shutdown.js';

// Fails closed: an unsafe production setting stops the start (config.ts).
const config = loadConfig(process.env);

const logger = createLogger();
const metrics = new Metrics(logger);
/**
 * State that must outlive a restart (ADR 0018): in Firestore when Firebase is configured, in
 * memory otherwise (local development; then it is lost on restart, as the forecast caches are).
 */
const firebaseApp = config.firebaseAccount ? initializeApp({ credential: cert(config.firebaseAccount) }) : undefined;
const store: StateStore = firebaseApp ? new FirestoreStateStore(getFirestore(firebaseApp)) : new MemoryStateStore();
/** A provider's fetch, counted against its limits and logged (debug). */
const counted = (name: string, limits = {}, weigh?: (url: URL) => number) =>
  instrumentFetch(name, metrics.provider(name, limits), logger, fetch, weigh);

// New calls stop near Open-Meteo's limit, for everyone (cached answers still go out).
const service = new WeatherService(
  new OpenMeteoProvider(counted('open-meteo', OPEN_METEO_LIMITS, openMeteoWeight)),
  config.forecastTtlSeconds * 1000,
  logger,
  metrics.budget('open-meteo'),
);
// Matches the user's location to a searched city through the weather service's cached search.
const places = new PlaceService(
  new NominatimGeocoder({ userAgent: config.nominatimUserAgent, fetchFn: counted('nominatim') }),
  service,
  undefined,
  logger,
);
// Locally the request comes from localhost, so the machine's own public address is looked
// up instead. Opt-in (IP_SELF_LOOKUP=1 in the local .env only): on by default, a server
// whose proxy setup is wrong would offer its data centre's city to every user.
const approximate = new ApproximateLocationService(
  new IpWhoIsLocator(counted('ipwhois', IPWHOIS_LIMITS)),
  places,
  config.ipSelfLookup,
  metrics.budget('ipwhois'),
);
// Official warnings (Europe). Region borders: data/meteoalarm-regions.json.gz, built by
// scripts/buildAlertRegions.ts from MeteoAlarm's published file; read on first request.
const regionsFile = new URL('../data/meteoalarm-regions.json.gz', import.meta.url);
const meteoAlarm = new MeteoAlarmProvider({
  regions: async () => new RegionIndex((await loadRegions(regionsFile)).regions),
  feedTtlMs: ALERTS_FEED_TTL_SECONDS * 1000,
  fetchFn: counted('meteoalarm'),
});
const alerts = new AlertService(meteoAlarm);

/**
 * Push notifications about warnings, if configured: FIREBASE_SERVICE_ACCOUNT is the service
 * account's JSON key (plain or base64), a secret; ALERTS_NOTIFY_SECRET guards the endpoint the
 * external scheduler calls. Without them the rest of the app works as before.
 */
const notifySecret = config.notifySecret;
const push = firebaseApp
  ? (() => {
      const sender = new FcmSender(firebaseApp);
      const notifier = new AlertNotifier(meteoAlarm, sender, Date.now, { store, logger });
      return { source: meteoAlarm, sender, notifier, notifySecret };
    })()
  : undefined;

for (const name of Object.keys(service.cacheStats())) metrics.cache(name, () => service.cacheStats()[name]!);
metrics.cache('reverse', () => places.cacheStats());

/** Set on SIGTERM (below): health answers 503 while requests under way finish. */
let draining = false;

const app = createApp(service, {
  corsOrigins: config.corsOrigins,
  places,
  approximate,
  trustProxy: config.trustProxy,
  alerts,
  push,
  rateLimits: DEFAULT_RATE_LIMITS,
  logger,
  metrics,
  // Guards GET /api/internal/metrics; a SECRET. Without it the endpoint does not exist.
  metricsSecret: config.metricsSecret,
  proxySecret: config.proxySecret,
  version: config.version,
  draining: () => draining,
});

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, production: config.production, node: process.version }, 'API listening');
});

// Provider usage survives restarts and deploys (stateStore.ts), so restarting can't reset the budget.
const usage = store.kind === 'memory' ? undefined : persistUsage(store, metrics, logger);
logger.info({ store: store.kind, push: !!push }, 'operational state store');

// A summary in the logs every 15 minutes: history of cache hit rates and provider usage
// without a metrics service (Render keeps the logs).
const metricsTimer = setInterval(() => logger.info({ metrics: metrics.snapshot() }, 'metrics'), 15 * 60_000);
metricsTimer.unref();

// Deploys and restarts send SIGTERM (Ctrl+C in a terminal, SIGINT): finish what is under way.
const shutdown = gracefulShutdown(server, {
  logger,
  // A notifier run under way and the last minute's provider usage, awaited (capped) so a
  // deploy neither cuts a run nor loses the counts.
  beforeExit: async () => {
    // Together, under one cap: a slow run must not leave no time for the counts.
    await Promise.all([push?.notifier.idle(), usage?.save()]);
  },
  onStart: () => {
    draining = true;
    clearInterval(metricsTimer);
    usage?.stop();
    logger.info({ metrics: metrics.snapshot() }, 'metrics');
  },
});
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// A crash is logged before the process ends (Render restarts it): Node would otherwise print
// the stack to stderr only, outside the JSON logs.
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled promise rejection');
  process.exit(1);
});
