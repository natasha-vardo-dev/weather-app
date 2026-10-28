import { ALERT_LEVELS, type AlertLevel, type AlertType } from './alerts.js';

/**
 * Push notifications about official warnings: what a device asks for. No accounts: the
 * device's push token is subscribed to topics (one per area, kind of warning and minimum
 * level), and the push service, not our server, remembers who wants what.
 */

/** Which warnings: storms only (the default) or every type. */
export const ALERT_GROUPS = ['storm', 'all'] as const;
export type AlertGroup = (typeof ALERT_GROUPS)[number];

/** What "storms" means: the types that come with wind and lightning. */
export const STORM_TYPES: readonly AlertType[] = ['wind', 'thunderstorm'];

export interface AlertNotificationSettings {
  group: AlertGroup;
  /** Notify from this level up. Orange by default: yellow warnings are common (fog across a country). */
  level: AlertLevel;
}

export const DEFAULT_ALERT_NOTIFICATIONS: AlertNotificationSettings = { group: 'storm', level: 'orange' };

/** POST /api/push/topics: subscribe (or unsubscribe) a device for a place. */
export interface AlertTopicsRequest extends AlertNotificationSettings {
  token: string;
  latitude: number;
  longitude: number;
  subscribe: boolean;
}

/** The areas the place belongs to: the service worker matches incoming warnings by them. */
export interface AlertTopicsResponse {
  areas: string[];
}

/**
 * What a push message carries (FCM data: strings only). Titles are built on the device from
 * `level` and `type` in the user's language; the texts are the issuer's, unmodified.
 */
export interface AlertPushData {
  /** The warning's first version: an update keeps it, so it replaces, not adds. */
  key: string;
  level: AlertLevel;
  type: AlertType;
  onset: string;
  expires: string;
  /** Areas the warning covers (region codes or grid cells), JSON array. */
  areas: string;
  /** Issuer's texts by language, JSON object: { "en-GB": { event, headline } }. */
  texts: string;
}

/** Whether a warning of this level and type reaches a device with these settings. */
export function matchesAlertSettings(level: AlertLevel, type: AlertType, settings: AlertNotificationSettings): boolean {
  return (
    ALERT_LEVELS.indexOf(level) >= ALERT_LEVELS.indexOf(settings.level) &&
    (settings.group === 'all' || STORM_TYPES.includes(type))
  );
}
