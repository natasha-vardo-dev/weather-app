/**
 * Turning warning notifications on and off for a place. The Firebase SDK is loaded only
 * here, on demand (the first click on the bell, or a token check for users who already
 * use notifications), so nobody else downloads it.
 */
import { ALERT_LEVELS, ALERT_TYPES, type AlertNotificationSettings } from '@weather/shared';
import { api } from '../api/client';
import type { Messages } from '../i18n/messages';
import {
  findAlertSubscription,
  getAlertSubscriptions,
  removeAlertSubscription,
  addPendingLeave,
  removePendingLeave,
  samePlace,
  replaceAlertSubscriptions,
  saveAlertSubscription,
  type AlertSubscription,
} from './alertSubscriptions';
import { firebaseConfig } from './config';

/** Strings the service worker writes notifications with, in the user's language. */
export interface PushStrings {
  titles: Record<string, Record<string, string>>;
  /** With a "{time}" placeholder. */
  until: string;
  /** With "{start}" and "{end}" placeholders. */
  fromTo: string;
}

export function pushStrings(t: Messages): PushStrings {
  const titles: PushStrings['titles'] = {};
  for (const level of ALERT_LEVELS) {
    titles[level] = {};
    for (const type of ALERT_TYPES) {
      if (type !== 'other') titles[level][type] = t.alerts.heading(t.alerts.levels[level], t.alerts.types[type]);
    }
  }
  return { titles, until: t.alerts.until('{time}'), fromTo: t.alerts.fromTo('{start}', '{end}') };
}

/** Hands the service worker what it needs to write a notification (it can't read localStorage). */
export function writeServiceWorkerState(strings: PushStrings, language: string, locale: string): Promise<void> {
  const { places } = getAlertSubscriptions();
  const state = {
    language,
    locale,
    strings,
    places: places.map(({ name, url, areas, timeZone }) => ({ name, url, areas, timeZone })),
  };
  return new Promise((resolve) => {
    const open = indexedDB.open('weather-push', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => resolve();
    open.onsuccess = () => {
      const tx = open.result.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(state, 'state');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    };
  });
}

export class PushError extends Error {
  constructor(public readonly reason: 'blocked' | 'unavailable' | 'failed') {
    super(reason);
  }
}

/** The service worker exists only in a production build; in development it never comes. */
function serviceWorker(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new PushError('unavailable')), 5000)),
  ]);
}

/** The Firebase SDK, loaded once on first use (its own chunk, never in the main bundle). */
let firebaseSdk: Promise<[typeof import('firebase/app'), typeof import('firebase/messaging')]> | null = null;

async function pushToken(): Promise<string> {
  if (!firebaseConfig) throw new PushError('unavailable');
  // A failed load (offline) is tried again next time rather than remembered.
  firebaseSdk ??= Promise.all([import('firebase/app'), import('firebase/messaging')]).catch((err: unknown) => {
    firebaseSdk = null;
    throw err;
  });
  const [{ getApps, initializeApp }, { getMessaging, getToken, isSupported }] = await firebaseSdk;
  if (!(await isSupported())) throw new PushError('unavailable');
  const { vapidKey, ...options } = firebaseConfig;
  const app = getApps()[0] ?? initializeApp(options);
  try {
    return await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: await serviceWorker() });
  } catch (err) {
    if (err instanceof PushError) throw err;
    throw new PushError('failed');
  }
}

function topicsRequest(
  token: string,
  place: { latitude: number; longitude: number },
  { group, level }: AlertNotificationSettings,
  subscribe: boolean,
) {
  return { token, latitude: place.latitude, longitude: place.longitude, group, level, subscribe };
}

/**
 * Asks for permission (from the click), subscribes the device and remembers the place.
 * `timeZone` is for a place whose time zone is still loading (turned on from the settings
 * list): it is awaited only after the permission prompt, which Safari shows only when asked
 * straight from the click.
 */
export async function enableAlerts(
  place: Omit<AlertSubscription, 'areas' | keyof AlertNotificationSettings>,
  settings: AlertNotificationSettings,
  timeZone?: Promise<string | undefined>,
): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushError(permission === 'denied' ? 'blocked' : 'failed');
  if (!place.timeZone && timeZone) {
    const zone = await timeZone;
    if (zone) place = { ...place, timeZone: zone };
  }
  const token = await pushToken();
  try {
    await serial(async () => {
      // A new token (they change now and then): the other places move to it first, or they
      // would stay on the old one, which later renewals would no longer notice.
      await moveToToken(token);
      await leavePending();
      const previous = findAlertSubscription(place);
      // Changing settings: join the new topic first, then leave the old one. The other way
      // round, a failed join would leave the device on no topic while the switch shows on.
      const { areas } = await api.setAlertTopics(topicsRequest(token, place, settings, true));
      const joined = { token, latitude: place.latitude, longitude: place.longitude, ...settings };
      saveAlertSubscription(token, { ...place, ...settings, areas });
      // Back to a setting whose leave was still pending: it is the current topic now.
      removePendingLeave(joined);
      if (previous && (previous.group !== settings.group || previous.level !== settings.level)) {
        const { latitude, longitude, group, level } = previous;
        const old = { token, latitude, longitude, group, level };
        // If leaving fails, it is remembered and retried (next change, turning off, next
        // start): a broader old topic would otherwise keep notifying for good.
        await api.setAlertTopics(topicsRequest(token, old, old, false)).catch(() => addPendingLeave(old));
      }
    });
  } catch {
    throw new PushError('failed');
  }
}

/**
 * Every change to the subscriptions (turning on or off, a new setting, a new token, leaving
 * old topics) runs one at a time: each reads the stored state, waits on the network and
 * writes it back, and two overlapping ones would overwrite each other (a token renewal on
 * start finishing after the user changed a setting would bring the old setting back).
 */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

/** Leaves the topics a failed change left behind (one at a time with other changes). */
export function leavePendingTopics(): Promise<void> {
  return serial(leavePending);
}

/**
 * What fails again stays for the next try. Never a topic that is current again: a user can
 * switch back to the setting whose leave was pending.
 */
async function leavePending(): Promise<void> {
  for (const item of getAlertSubscriptions().leave ?? []) {
    const current = findAlertSubscription(item);
    const { token } = getAlertSubscriptions();
    if (current && token === item.token && current.group === item.group && current.level === item.level) {
      removePendingLeave(item);
      continue;
    }
    try {
      await api.setAlertTopics(topicsRequest(item.token, item, item, false));
      removePendingLeave(item);
    } catch {
      // Kept: retried later. A token FCM no longer knows succeeds (it is on no topic).
    }
  }
}

export function disableAlerts(place: { latitude: number; longitude: number }): Promise<void> {
  return serial(async () => {
    await leavePending();
    const subscription = findAlertSubscription(place);
    const { token } = getAlertSubscriptions();
    if (subscription && token) {
      try {
        await api.setAlertTopics(topicsRequest(token, subscription, subscription, false));
      } catch {
        throw new PushError('failed');
      }
    }
    removeAlertSubscription(place);
  });
}

/**
 * Push tokens change now and then (browser updates, long inactivity). On start, for users with
 * notifications on, a new token is subscribed to the same places; otherwise warnings would
 * silently stop. Failures are retried on the next start.
 */
export async function renewAlertsToken(): Promise<void> {
  const state = getAlertSubscriptions();
  if (!state.places.length || !firebaseConfig || Notification.permission !== 'granted') return;
  const token = await pushToken();
  await serial(() => moveToToken(token));
}

/**
 * Subscribes every stored place with `token` if it is not the stored one, then stores it.
 * Writes into the state as it is after the network calls, not the copy read before them.
 */
async function moveToToken(token: string): Promise<void> {
  const before = getAlertSubscriptions();
  if (token === before.token) return;
  const moved = await Promise.all(
    before.places.map(async (place) => {
      const { areas } = await api.setAlertTopics(topicsRequest(token, place, place, true));
      return { ...place, areas };
    }),
  );
  const now = getAlertSubscriptions();
  const places = now.places.map(
    (place) => moved.find((m) => samePlace(m, place) && m.group === place.group && m.level === place.level) ?? place,
  );
  replaceAlertSubscriptions({ ...now, token, places });
}
