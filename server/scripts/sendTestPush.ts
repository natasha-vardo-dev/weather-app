/**
 * Sends a test push notification through Firebase Cloud Messaging, to check delivery end to
 * end without waiting for a real warning. Uses FIREBASE_SERVICE_ACCOUNT from server/.env: it
 * must belong to the same Firebase project as the site (VITE_FIREBASE_*), wherever the site runs.
 *
 *   npm run push:test -w server -- --token <token>           one device (safe)
 *   npm run push:test -w server -- <lat> <lon> --dry-run     the place's topics, nothing sent
 *   npm run push:test -w server -- <lat> <lon> --everyone    every device subscribed there
 *
 * The token is the device's: in the page's console, after turning the bell on,
 * JSON.parse(localStorage.getItem('alert-notifications:v1')).token
 *
 * Topic mode also checks the subscription itself, but reaches every device subscribed to
 * the place, real users included, hence the explicit flag. The notification reads
 * "Test warning" (its type is none the page knows) and expires in an hour. Neither the token
 * nor the key is ever printed.
 */
import 'dotenv/config';
import { ALERT_GROUPS, ALERT_LEVELS, isValidCoordinates } from '@weather/shared';
import { cert, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../src/config.js';
import { sendMessages } from '../src/providers/fcm.js';
import { MeteoAlarmProvider } from '../src/providers/meteoAlarm.js';
import { alertTopic } from '../src/services/alertNotifier.js';
import { loadRegions, RegionIndex } from '../src/services/regions.js';

const TTL_SECONDS = 60 * 60;

/**
 * A data message shaped like a real warning's (AlertPushData), but of a type the page has no
 * title for, so the service worker titles it from `event`: "Test warning".
 */
export function testPushData(now: number, areas: string[]): Record<string, string> {
  return {
    key: `test-${now}`,
    level: 'red',
    type: 'test',
    onset: new Date(now).toISOString(),
    expires: new Date(now + TTL_SECONDS * 1000).toISOString(),
    areas: JSON.stringify(areas),
    texts: JSON.stringify({
      en: { event: 'Test warning', headline: 'A test notification from Weather. Not a real warning.' },
    }),
  };
}

/** Every topic a device subscribed to these areas can be on: each kind, each minimum level. */
export function everyTopic(areas: string[]): string[] {
  return areas.flatMap((area) =>
    ALERT_GROUPS.flatMap((group) => ALERT_LEVELS.map((level) => alertTopic(area, group, level))),
  );
}

type Args = { token: string } | { latitude: number; longitude: number; dryRun: boolean; everyone: boolean };

export function parseArgs(argv: string[]): Args {
  const tokenAt = argv.indexOf('--token');
  if (tokenAt >= 0) {
    const token = argv[tokenAt + 1];
    if (!token || token.startsWith('--')) throw new Error('--token needs the device token');
    return { token };
  }
  const [latitude, longitude] = argv.filter((arg) => !arg.startsWith('--')).map(Number);
  if (latitude === undefined || longitude === undefined || !isValidCoordinates(latitude, longitude)) {
    throw new Error('Usage: --token <token> | <lat> <lon> --dry-run | <lat> <lon> --everyone');
  }
  return { latitude, longitude, dryRun: argv.includes('--dry-run'), everyone: argv.includes('--everyone') };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = Date.now();

  let areas: string[] = [];
  if (!('token' in args)) {
    // Same areas as subscribing (routes/push.ts); only the region file is read, no feed.
    const meteoAlarm = new MeteoAlarmProvider({
      regions: async () =>
        new RegionIndex((await loadRegions(new URL('../data/meteoalarm-regions.json.gz', import.meta.url))).regions),
      feedTtlMs: 0,
      fetchFn: () => Promise.reject(new Error('no network calls here')),
    });
    areas = await meteoAlarm.areasAt(args.latitude, args.longitude);
    if (areas.length === 0)
      throw new Error('MeteoAlarm does not cover this place: there is no bell, nothing to send to');
    console.log(`Areas: ${areas.join(', ')}`);
    if (args.dryRun || !args.everyone) {
      console.log(`Topics:\n  ${everyTopic(areas).join('\n  ')}`);
      if (!args.dryRun) console.log('Nothing sent: add --everyone to send to every device subscribed there.');
      return;
    }
  }

  const account = loadConfig(process.env).firebaseAccount;
  if (!account) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set (server/.env)');
  const messaging = getMessaging(initializeApp({ credential: cert(account) }));
  const data = testPushData(now, areas);
  const webpush = { headers: { Urgency: 'high', TTL: String(TTL_SECONDS) } };

  if ('token' in args) {
    await messaging.send({ token: args.token, data, webpush });
    console.log('Sent to the device. A notification "Test warning" should appear within seconds.');
    return;
  }
  const messages = everyTopic(areas).map((topic) => ({ topic, data, ttlSeconds: TTL_SECONDS }));
  const { accepted, rejected } = await sendMessages(messages, (batch) => messaging.sendEach(batch));
  console.log(`Sent: ${accepted} topic messages accepted, ${rejected} refused.`);
  // A device on several of the place's topics gets one notification: the same tag replaces it.
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: Error) => {
    // Firebase errors name the code and the cause, never the key or the token.
    console.error(err.message);
    process.exitCode = 1;
  });
}
