/**
 * The places this device gets warning notifications for, in localStorage. The push service
 * keeps the actual topic subscriptions (the server stores nothing); this list is what lets the
 * device change or undo them, renew them when its push token changes, and name the place in a
 * notification. Plain functions, like the favourites store, so the rules are unit-tested.
 */
import {
  ALERT_GROUPS,
  ALERT_LEVELS,
  isValidCoordinates,
  type AlertGroup,
  type AlertLevel,
  type AlertNotificationSettings,
} from '@weather/shared';

export const ALERT_SUBSCRIPTIONS_KEY = 'alert-notifications:v1';

export interface AlertSubscription extends AlertNotificationSettings {
  latitude: number;
  longitude: number;
  /** As shown when it was turned on; the notification uses it. */
  name: string;
  /** The city page to open from the notification. */
  url: string;
  /** Areas the server put the place in: incoming warnings are matched to places by them. */
  areas: string[];
  timeZone?: string;
}

/** A topic the device still has to leave (an earlier setting for a place), and with which token. */
export interface PendingLeave extends AlertNotificationSettings {
  token: string;
  latitude: number;
  longitude: number;
}

export interface AlertSubscriptionsState {
  /** The push token the subscriptions belong to; a new token means subscribing again. */
  token: string | null;
  places: AlertSubscription[];
  /**
   * Topics left behind when leaving them failed after a settings change, retried until gone:
   * otherwise a broader old setting (all from yellow) would keep notifying, even after the
   * place is turned off. Absent in states stored before it existed.
   */
  leave?: PendingLeave[];
}

const EMPTY: AlertSubscriptionsState = { token: null, places: [] };

/** Same place: coordinates rounded to ~1 km, as everywhere in the app. */
export function samePlace(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): boolean {
  return a.latitude.toFixed(2) === b.latitude.toFixed(2) && a.longitude.toFixed(2) === b.longitude.toFixed(2);
}

/** Storage is untrusted (edited, older format): anything malformed is dropped. */
export function parseAlertSubscriptions(value: unknown): AlertSubscriptionsState {
  if (!value || typeof value !== 'object') return EMPTY;
  const { token, places, leave } = value as Record<string, unknown>;
  const valid = (Array.isArray(places) ? places : []).filter((p): p is AlertSubscription => {
    if (!p || typeof p !== 'object') return false;
    const s = p as Record<string, unknown>;
    return (
      typeof s.latitude === 'number' &&
      typeof s.longitude === 'number' &&
      isValidCoordinates(s.latitude, s.longitude) &&
      typeof s.name === 'string' &&
      typeof s.url === 'string' &&
      s.url.startsWith('/') &&
      ALERT_GROUPS.includes(s.group as AlertGroup) &&
      ALERT_LEVELS.includes(s.level as AlertLevel) &&
      Array.isArray(s.areas) &&
      s.areas.every((area) => typeof area === 'string')
    );
  });
  const pending = (Array.isArray(leave) ? leave : []).filter((p): p is PendingLeave => {
    if (!p || typeof p !== 'object') return false;
    const s = p as Record<string, unknown>;
    return (
      typeof s.token === 'string' &&
      typeof s.latitude === 'number' &&
      typeof s.longitude === 'number' &&
      isValidCoordinates(s.latitude, s.longitude) &&
      ALERT_GROUPS.includes(s.group as AlertGroup) &&
      ALERT_LEVELS.includes(s.level as AlertLevel)
    );
  });
  const state: AlertSubscriptionsState = { token: typeof token === 'string' && token ? token : null, places: valid };
  return pending.length ? { ...state, leave: pending } : state;
}

const listeners = new Set<() => void>();
let cache: { raw: string | null; state: AlertSubscriptionsState } = { raw: null, state: EMPTY };

function read(): string | null {
  try {
    return localStorage.getItem(ALERT_SUBSCRIPTIONS_KEY);
  } catch {
    return null;
  }
}

/** Stable while storage is unchanged (useSyncExternalStore). */
export function getAlertSubscriptions(): AlertSubscriptionsState {
  const raw = read();
  if (raw !== cache.raw) {
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    cache = { raw, state: parseAlertSubscriptions(parsed) };
  }
  return cache.state;
}

export function subscribeAlertSubscriptions(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === ALERT_SUBSCRIPTIONS_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function write(state: AlertSubscriptionsState): void {
  try {
    localStorage.setItem(ALERT_SUBSCRIPTIONS_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked: the subscription still works, it just can't be changed later here.
  }
  listeners.forEach((listener) => listener());
}

export function findAlertSubscription(place: { latitude: number; longitude: number }): AlertSubscription | undefined {
  return getAlertSubscriptions().places.find((p) => samePlace(p, place));
}

/** Adds or replaces the place's subscription. */
export function saveAlertSubscription(token: string, subscription: AlertSubscription): void {
  const state = getAlertSubscriptions();
  write({ ...state, token, places: [subscription, ...state.places.filter((p) => !samePlace(p, subscription))] });
}

export function removeAlertSubscription(place: { latitude: number; longitude: number }): void {
  const state = getAlertSubscriptions();
  write({ ...state, places: state.places.filter((p) => !samePlace(p, place)) });
}

export function replaceAlertSubscriptions(state: AlertSubscriptionsState): void {
  write(state);
}

const sameLeave = (a: PendingLeave, b: PendingLeave) =>
  a.token === b.token && samePlace(a, b) && a.group === b.group && a.level === b.level;

export function addPendingLeave(item: PendingLeave): void {
  const state = getAlertSubscriptions();
  write({ ...state, leave: [...(state.leave ?? []).filter((p) => !sameLeave(p, item)), item] });
}

export function removePendingLeave(item: PendingLeave): void {
  const state = getAlertSubscriptions();
  const leave = (state.leave ?? []).filter((p) => !sameLeave(p, item));
  const { leave: _leave, ...rest } = state;
  write(leave.length ? { ...rest, leave } : rest);
}
