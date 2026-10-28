import { ALERT_LEVELS, STORM_TYPES, type AlertGroup, type AlertLevel, type AlertPushData, type AlertType } from '@weather/shared';
import { ProviderError } from '../errors.js';
import type { AlertBroadcastSource, PushMessage, PushSender } from '../providers/types.js';

/** Topic for one area, kind of warning and minimum level: "PL1465.storm.orange". */
export function alertTopic(area: string, group: AlertGroup, level: AlertLevel): string {
  return `${area}.${group}.${level}`;
}

/** Every topic a warning goes to: each area, "all" (and "storm" for storms), each minimum level it reaches. */
export function topicsForWarning(areas: string[], type: AlertType, level: AlertLevel): string[] {
  const groups: AlertGroup[] = STORM_TYPES.includes(type) ? ['storm', 'all'] : ['all'];
  const levels = ALERT_LEVELS.slice(0, ALERT_LEVELS.indexOf(level) + 1);
  return areas.flatMap((area) => groups.flatMap((group) => levels.map((min) => alertTopic(area, group, min))));
}

/** Stays well inside FCM's 4 KB data limit when an issuer writes long headlines in several languages. */
const MAX_HEADLINE = 160;

interface Notified {
  /** The warning's first version: updates share it, and so the device's notification tag. */
  key: string;
  level: AlertLevel;
  expiresAt: number;
}

export interface NotifyResult {
  warnings: number;
  notified: number;
  messages: number;
  /** True for the first run after a start: warnings were recorded, not sent. */
  warmUp: boolean;
}

/**
 * Sends a push for every new official warning, once. Run every few minutes by an external
 * scheduler (which also keeps a free-tier server awake).
 *
 * No database: what was sent is kept in memory until the warning ends. After a restart the
 * first read of each source (a country's feed) only records the warnings in force, so nobody
 * gets them again; the price is that warnings issued while the server was down are not
 * pushed (the page still shows them). Warm-up is per source and per warning: a feed that
 * failed on the first run, or a warning whose full text failed to load then, is recorded
 * silently when it is first read, not pushed as new.
 *
 * A warning counts as sent only once its messages were accepted: if sending fails, the next
 * run tries it again (and the run fails, so the scheduler shows it).
 * An update of a warning (CAP `references`) is the same warning: it notifies again only if
 * its level went up, and its key (the device's notification tag) stays the same, so a
 * notification the user closed does not come back.
 */
export class AlertNotifier {
  private readonly seen = new Map<string, number>();
  private readonly notified = new Map<string, Notified>();
  /** Sources read at least once since the start: their warnings in force then were recorded. */
  private readonly warmed = new Set<string>();
  /** Warnings listed during a source's warm-up that couldn't be loaded yet: never pushed. */
  private readonly quiet = new Map<string, number>();
  private running: Promise<NotifyResult> | null = null;

  constructor(
    private readonly source: AlertBroadcastSource,
    private readonly sender: PushSender,
    private readonly now: () => number = Date.now,
  ) {}

  /** Overlapping calls (a slow run, a double trigger) share one run. */
  run(): Promise<NotifyResult> {
    this.running ??= this.check().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async check(): Promise<NotifyResult> {
    const now = this.now();
    for (const [ref, expiresAt] of this.seen) if (expiresAt <= now) this.seen.delete(ref);
    for (const [ref, expiresAt] of this.quiet) if (expiresAt <= now) this.quiet.delete(ref);
    for (const [id, entry] of this.notified) if (entry.expiresAt <= now) this.notified.delete(id);

    const warmUp = this.warmed.size === 0;
    const { warnings, read } = await this.source.listWarnings();
    let notified = 0;
    let messages = 0;
    let failed = 0;
    for (const warning of warnings) {
      if (this.seen.has(warning.ref)) continue;
      const expiresAt = Date.parse(warning.expires);
      // In force before this source was first read: record it, never push it.
      const existing = !this.warmed.has(warning.source) || this.quiet.has(warning.ref);
      const alert = await this.source.loadWarning(warning.ref).catch(() => undefined);
      // Not loaded: try again next run. Loaded but not a warning (green, unreadable): done.
      if (alert === undefined) {
        if (existing) this.quiet.set(warning.ref, expiresAt);
        continue;
      }
      if (!alert) {
        this.seen.set(warning.ref, expiresAt);
        continue;
      }

      const earlier = alert.replaces.map((id) => this.notified.get(id)).filter((n): n is Notified => !!n);
      const earlierLevel = Math.max(-1, ...earlier.map((n) => ALERT_LEVELS.indexOf(n.level)));
      const level = ALERT_LEVELS.indexOf(alert.level);
      const key = earlier[0]?.key ?? alert.id;
      const record = () => {
        this.seen.set(warning.ref, expiresAt);
        this.quiet.delete(warning.ref);
        this.notified.set(alert.id, { key, level: ALERT_LEVELS[Math.max(level, earlierLevel)]!, expiresAt });
      };
      if (existing || level <= earlierLevel) {
        record();
        continue;
      }

      const data: AlertPushData = {
        key,
        level: alert.level,
        type: alert.type,
        onset: alert.onset,
        expires: alert.expires,
        areas: JSON.stringify(warning.areas.length > 60 ? [] : warning.areas),
        texts: JSON.stringify(
          Object.fromEntries(
            alert.texts.map((t) => [t.language, { event: t.event, headline: t.headline?.slice(0, MAX_HEADLINE) }]),
          ),
        ),
      };
      const ttlSeconds = Math.max(60, Math.round((expiresAt - now) / 1000));
      const batch = topicsForWarning(warning.areas, alert.type, alert.level).map(
        (topic): PushMessage => ({ topic, data: { ...data }, ttlSeconds }),
      );
      // One warning at a time, recorded only once sent: a failure leaves just this warning
      // to retry, and never repeats the ones already pushed.
      try {
        messages += await this.sender.send(batch);
      } catch {
        failed++;
        continue;
      }
      record();
      notified++;
    }

    for (const source of read) this.warmed.add(source);
    if (failed) {
      throw new ProviderError(
        `FCM send failed for ${failed} warning(s)`,
        `${failed} warning(s) could not be sent; they are retried on the next run.`,
      );
    }
    return { warnings: warnings.length, notified, messages, warmUp };
  }
}
