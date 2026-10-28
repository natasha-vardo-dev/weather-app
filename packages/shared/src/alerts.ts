/**
 * Official weather warnings: the API contract and helpers every client shares.
 * Levels and types are keys (clients translate them); the issuer's own texts are passed on
 * unmodified, as MeteoAlarm's redistribution terms require.
 */

/** MeteoAlarm's awareness levels 2–4; level 1 ("green", no warning) is never sent. */
export const ALERT_LEVELS = ['yellow', 'orange', 'red'] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

/** MeteoAlarm's awareness types (CAP profile v2.0), plus "other" for anything new. */
export const ALERT_TYPES = [
  'wind',
  'snow-ice',
  'thunderstorm',
  'fog',
  'high-temperature',
  'low-temperature',
  'coastal-event',
  'forest-fire',
  'avalanches',
  'rain',
  'flooding',
  'rain-flood',
  'marine-hazard',
  'drought',
  'other',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export interface WeatherAlert {
  /** Stable for one warning (its CAP identifier). */
  id: string;
  level: AlertLevel;
  type: AlertType;
  /** ISO 8601; the warning is in force from `onset` to `expires`. */
  onset: string;
  expires: string;
  /** Language of the texts below (BCP 47, e.g. "pl-PL"): the user's if the issuer has it, else English. */
  language: string;
  /** The issuer's own wording, unmodified. */
  event: string;
  headline?: string;
  description?: string;
  instruction?: string;
  /** The national weather service that issued it. */
  sender?: string;
  /** The issuer's page about this kind of warning. */
  web?: string;
}

export interface AlertsResponse {
  /** Most severe first, then soonest. Empty where there are none or no coverage. */
  alerts: WeatherAlert[];
  /** Who to credit next to the warnings (required by the source's terms). */
  attribution: { name: string; url: string } | null;
}

/** Most severe first; among equals, the one that starts first. */
export function compareAlerts(a: WeatherAlert, b: WeatherAlert): number {
  const byLevel = ALERT_LEVELS.indexOf(b.level) - ALERT_LEVELS.indexOf(a.level);
  return byLevel !== 0 ? byLevel : Date.parse(a.onset) - Date.parse(b.onset);
}

/** Whether the warning is in force at `now` (not just announced for later). */
export function isAlertActive(alert: Pick<WeatherAlert, 'onset' | 'expires'>, now: number): boolean {
  return Date.parse(alert.onset) <= now && now < Date.parse(alert.expires);
}
