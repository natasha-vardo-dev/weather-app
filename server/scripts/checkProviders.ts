/**
 * Asks the real providers once, through the server's own adapters, and fails when an answer no
 * longer reads: the tests run on recorded answers, so a change of format at Open-Meteo or
 * MeteoAlarm would otherwise be found by users first. Run daily by
 * .github/workflows/providers.yml, and by hand:
 *
 *   npm run providers:check -w server
 *
 * About five Open-Meteo calls and MeteoAlarm's feeds once (what the notifier reads every 5
 * minutes). A refusal for load (HTTP 429) is not a change of format: GitHub's runners share
 * addresses, so it is reported as skipped, not failed. Prints no coordinates of users: the
 * places are fixed here.
 */
import { pathToFileURL } from 'node:url';
import { ProviderError } from '../src/errors.js';
import { MeteoAlarmProvider } from '../src/providers/meteoAlarm.js';
import { OpenMeteoProvider } from '../src/providers/openMeteo.js';
import { loadRegions, RegionIndex } from '../src/services/regions.js';

const WARSAW = { latitude: 52.23, longitude: 21.01 };
/** More than this share of country feeds failing at once is a change, not one feed's bad day. */
const MAX_FAILED_FEEDS = 0.25;
/**
 * Full warnings read to check their format. Each is a request; ten, because a listed warning
 * may legitimately read as none (a green level), so only all of them failing means a change.
 */
const WARNINGS_READ = 10;

export interface CheckResult {
  name: string;
  status: 'ok' | 'skipped' | 'failed';
  detail: string;
}

export interface Providers {
  openMeteo: Pick<OpenMeteoProvider, 'getForecast' | 'getAirQuality' | 'searchLocations'>;
  meteoAlarm: Pick<MeteoAlarmProvider, 'listWarnings' | 'loadWarning' | 'getAlerts'>;
}

const isRateLimited = (err: unknown) => err instanceof ProviderError && /HTTP 429/.test(err.detail ?? '');

async function check(name: string, run: () => Promise<string>): Promise<CheckResult> {
  try {
    return { name, status: 'ok', detail: await run() };
  } catch (err) {
    const detail = err instanceof ProviderError ? (err.detail ?? err.message) : String(err);
    return { name, status: isRateLimited(err) ? 'skipped' : 'failed', detail };
  }
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export async function checkProviders({ openMeteo, meteoAlarm }: Providers): Promise<CheckResult[]> {
  return [
    await check('Open-Meteo forecast', async () => {
      const forecast = await openMeteo.getForecast(WARSAW.latitude, WARSAW.longitude, 10);
      expect(forecast.daily.length === 10, `${forecast.daily.length} days instead of 10`);
      expect(forecast.hourly.length >= 24, `${forecast.hourly.length} hours instead of 24`);
      return `${forecast.timezone}, now ${forecast.current.temperature} ${forecast.units.temperature}`;
    }),
    await check('Open-Meteo air quality', async () => {
      const air = await openMeteo.getAirQuality(WARSAW.latitude, WARSAW.longitude);
      expect(air.europeanAqi !== null || air.usAqi !== null, 'no index on either scale');
      return `European AQI ${air.europeanAqi}`;
    }),
    await check('Open-Meteo search', async () => {
      const found = await openMeteo.searchLocations('Warsaw', 5, 'en');
      expect(
        found.some((place) => place.country === 'Poland'),
        'Warsaw, Poland not found',
      );
      return `${found.length} places`;
    }),
    await check('MeteoAlarm feeds', async () => {
      const { warnings, read, failed } = await meteoAlarm.listWarnings();
      const total = read.length + failed.length;
      expect(
        failed.length <= total * MAX_FAILED_FEEDS,
        `${failed.length} of ${total} feeds failed: ${failed.join(', ')}`,
      );
      // Full warnings (CAP): their format is the other half of what can change. A CAP that no
      // longer reads comes back as null, not an error (the notifier then treats it as no
      // warning and never pushes it), so the results are checked, not just awaited.
      const sample = warnings.slice(0, WARNINGS_READ);
      // Settled one by one: a single CAP failing to download (a timeout, a warning replaced
      // since the list) is not a change of format and must not fail the check.
      const loaded = await Promise.allSettled(sample.map((warning) => meteoAlarm.loadWarning(warning.ref)));
      const readable = loaded.filter(
        (result) =>
          result.status === 'fulfilled' && result.value && result.value.level && result.value.texts.length > 0,
      ).length;
      const errors = loaded.flatMap((result) =>
        result.status === 'rejected'
          ? [
              result.reason instanceof ProviderError
                ? (result.reason.detail ?? result.reason.message)
                : String(result.reason),
            ]
          : [],
      );
      expect(
        sample.length === 0 || readable > 0,
        `none of ${sample.length} full warnings reads as a warning${errors.length ? ` (errors: ${[...new Set(errors)].join('; ')})` : ''}`,
      );
      return `${read.length} of ${total} feeds, ${warnings.length} warnings, ${readable} of ${sample.length} full ones read${failed.length ? `; failed: ${failed.join(', ')}` : ''}`;
    }),
    await check('MeteoAlarm warnings for a place', async () => {
      const alerts = await meteoAlarm.getAlerts(WARSAW.latitude, WARSAW.longitude);
      return `${alerts.length} for Warsaw`;
    }),
  ];
}

async function main() {
  const regionsFile = new URL('../data/meteoalarm-regions.json.gz', import.meta.url);
  const results = await checkProviders({
    openMeteo: new OpenMeteoProvider(),
    meteoAlarm: new MeteoAlarmProvider({
      regions: async () => new RegionIndex((await loadRegions(regionsFile)).regions),
      feedTtlMs: 60_000,
    }),
  });
  for (const { name, status, detail } of results) console.log(`${status.padEnd(7)} ${name}: ${detail}`);
  if (results.some((result) => result.status === 'failed')) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
