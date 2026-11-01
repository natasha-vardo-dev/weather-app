import {
  ALERT_LEVELS,
  STORM_TYPES,
  type AlertGroup,
  type AlertLevel,
  type AlertPushData,
  type AlertType,
} from '@weather/shared';
import { randomUUID } from 'node:crypto';
import { ProviderError } from '../errors.js';
import { silentLogger, type Logger } from '../observability/logger.js';
import type { AlertBroadcastSource, PushMessage, PushSender } from '../providers/types.js';
import { MemoryStateStore, type StateStore } from './stateStore.js';

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

/**
 * FCM refuses a data payload over 4,096 bytes. The headline cap alone does not bound it: the
 * bytes depend on the script (Cyrillic or Greek is two bytes a character) and on how many
 * languages an issuer gives. Room is left for FCM's own keys.
 */
export const MAX_PAYLOAD_BYTES = 3800;

const payloadBytes = (data: Record<string, string>) =>
  Object.entries(data).reduce((total, [key, value]) => total + Buffer.byteLength(key) + Buffer.byteLength(value), 0);

/**
 * The push data within MAX_PAYLOAD_BYTES, giving up the least useful parts first: headlines
 * (the device still names the event in the user's language), then the area list (the device
 * then matches by topic only), then languages other than English and the issuer's first.
 */
export function fitPayload(data: AlertPushData): AlertPushData {
  if (payloadBytes({ ...data }) <= MAX_PAYLOAD_BYTES) return data;
  const texts = JSON.parse(data.texts) as Record<string, { event: string; headline?: string }>;
  const events = Object.fromEntries(Object.entries(texts).map(([language, { event }]) => [language, { event }]));
  const steps: AlertPushData[] = [
    { ...data, texts: JSON.stringify(events) },
    { ...data, texts: JSON.stringify(events), areas: '[]' },
  ];
  const kept = Object.entries(events).filter(([language], i) => i === 0 || language.toLowerCase().startsWith('en'));
  steps.push({ ...data, texts: JSON.stringify(Object.fromEntries(kept)), areas: '[]' });
  for (const step of steps) if (payloadBytes({ ...step }) <= MAX_PAYLOAD_BYTES) return step;
  return steps.at(-1)!;
}

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
  /** True for the first run without saved state: warnings were recorded, not sent. */
  warmUp: boolean;
  /** Feeds read this run, and the ones that failed (retried next run). */
  feedsRead: number;
  feedsFailed: string[];
  /** Messages FCM refused for good (malformed, too large): not retried, but counted. */
  rejected: number;
  /** Another instance holds the lease (a deploy in progress): nothing was done. */
  skipped?: boolean;
}

/** For the operations endpoint and the logs (docs/operations.md). */
export interface NotifierStatus {
  /** Where its state lives: "memory" forgets what was sent on restart. */
  store: StateStore['kind'];
  lastRunAt: number | null;
  /** The last run that read every feed and had nothing failed or refused. */
  lastSuccessAt: number | null;
  lastError: string | null;
  feedsFailed: string[];
  /** Refused for good in the last run, and when that last happened (kept across restarts). */
  rejected: number;
  lastRejectedAt: number | null;
}

/** What survives a restart. Version 1; anything else read back is ignored (fresh warm-up). */
interface SavedState {
  version: 1;
  seen: [string, number][];
  notified: [string, Notified][];
  warmed: string[];
  quiet: [string, number][];
  lastSuccessAt: number | null;
  /** Added later in version 1: absent in older documents. */
  lastRejectedAt?: number | null;
}

const STATE = 'alert-notifier';
/** A run takes seconds; the scheduler calls every 5 minutes. */
const LEASE_MS = 4 * 60 * 1000;

const isPairs = <T>(value: unknown, check: (v: unknown) => v is T): value is [string, T][] =>
  Array.isArray(value) &&
  value.every((p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && check(p[1]));
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNotified = (v: unknown): v is Notified =>
  !!v &&
  typeof (v as Notified).key === 'string' &&
  ALERT_LEVELS.includes((v as Notified).level) &&
  isNumber((v as Notified).expiresAt);

/** Stored state is checked like any input: a broken document must not break every run. */
function isSavedState(value: unknown): value is SavedState {
  const v = value as Partial<SavedState> | null;
  return (
    !!v &&
    v.version === 1 &&
    isPairs(v.seen, isNumber) &&
    isPairs(v.notified, isNotified) &&
    isPairs(v.quiet, isNumber) &&
    Array.isArray(v.warmed) &&
    v.warmed.every((s) => typeof s === 'string') &&
    (v.lastSuccessAt === null || isNumber(v.lastSuccessAt)) &&
    (v.lastRejectedAt === undefined || v.lastRejectedAt === null || isNumber(v.lastRejectedAt))
  );
}

export interface NotifierOptions {
  /** Where what was sent is kept between runs and restarts (ADR 0018); memory by default. */
  store?: StateStore;
  logger?: Logger;
  /** Names this instance in the lease. */
  holder?: string;
}

/**
 * Sends a push for every new official warning, once. Run every few minutes by an external
 * scheduler (which also keeps a free-tier server awake).
 *
 * What was sent is kept until the warning ends, in a StateStore (ADR 0018): with Firestore it
 * survives restarts and deploys, so warnings issued while the server was down are pushed on
 * the next run, and nothing is sent twice. Only without saved state (the first start, or the
 * memory store) does the first read of each source (a country's feed) only record the
 * warnings in force, so nobody gets them again. Warm-up is per source and per warning: a
 * feed that failed on the first run, or a warning whose full text failed to load then, is
 * recorded silently when it is first read, not pushed as new.
 *
 * A warning counts as sent only once its messages were accepted: if sending fails, the next
 * run tries it again (and the run fails, so the scheduler shows it). Messages FCM refuses for
 * good are counted and logged, since retrying would fail the same way. A run where every feed
 * failed fails too: "no warnings" must not look like success.
 * An update of a warning (CAP `references`) is the same warning: it notifies again only if
 * its level went up, and its key (the device's notification tag) stays the same, so a
 * notification the user closed does not come back.
 */
export class AlertNotifier {
  private readonly seen = new Map<string, number>();
  private readonly notified = new Map<string, Notified>();
  /** Sources read at least once (saved state included): their warnings in force then were recorded. */
  private readonly warmed = new Set<string>();
  /** Warnings listed during a source's warm-up that couldn't be loaded yet: never pushed. */
  private readonly quiet = new Map<string, number>();
  private running: Promise<NotifyResult> | null = null;
  private readonly store: StateStore;
  private readonly logger: Logger;
  private readonly holder: string;
  private readonly state: NotifierStatus;

  constructor(
    private readonly source: AlertBroadcastSource,
    private readonly sender: PushSender,
    private readonly now: () => number = Date.now,
    options: NotifierOptions = {},
  ) {
    this.store = options.store ?? new MemoryStateStore(now);
    this.logger = options.logger ?? silentLogger;
    this.holder = options.holder ?? randomUUID();
    this.state = {
      store: this.store.kind,
      lastRunAt: null,
      lastSuccessAt: null,
      lastError: null,
      feedsFailed: [],
      rejected: 0,
      lastRejectedAt: null,
    };
  }

  /** Overlapping calls (a slow run, a double trigger) share one run. */
  run(): Promise<NotifyResult> {
    this.running ??= this.leased().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Settles when no run is under way: shutdown waits for it, so a run is not cut midway. */
  idle(): Promise<void> {
    return (this.running ?? Promise.resolve()).then(
      () => undefined,
      () => undefined,
    );
  }

  status(): NotifierStatus {
    return { ...this.state, feedsFailed: [...this.state.feedsFailed] };
  }

  /** One run at a time across instances (a deploy overlaps two for a while). */
  private async leased(): Promise<NotifyResult> {
    this.state.lastRunAt = this.now();
    let leased: boolean;
    try {
      leased = await this.store.lease(STATE, this.holder, LEASE_MS);
    } catch (err) {
      return this.fail(err);
    }
    if (!leased) {
      this.logger.info('notifier: another instance holds the lease, skipping this run');
      const nothing = { warnings: 0, notified: 0, messages: 0, feedsRead: 0, feedsFailed: [], rejected: 0 };
      return { ...nothing, warmUp: false, skipped: true };
    }
    try {
      return await this.locked();
    } catch (err) {
      return this.fail(err);
    } finally {
      await this.store.release(STATE, this.holder).catch(() => {});
    }
  }

  /**
   * The state is read first and saved after, even when the run fails (what was sent before
   * the failure stays sent). Loading fails the run rather than starting empty: an empty start
   * would warm up silently and then overwrite what was saved.
   */
  private async locked(): Promise<NotifyResult> {
    await this.load();
    let result: NotifyResult | undefined;
    let error: unknown;
    try {
      result = await this.check();
    } catch (err) {
      error = err;
    }
    try {
      await this.save();
    } catch (err) {
      error ??= new ProviderError(
        `notifier state save: ${(err as Error).message}`,
        'Could not save the record of what was sent; the next run saves it first.',
      );
    }
    if (error) throw error;
    return result!;
  }

  private fail(err: unknown): never {
    this.state.lastError = err instanceof ProviderError ? (err.detail ?? err.message) : String(err);
    this.logger.error({ err }, 'notifier run failed');
    throw err;
  }

  /**
   * Read at the start of every run, not once per process, and merged into memory rather than
   * replacing it: during a deploy two instances can take turns (the lease stops overlapping
   * runs, not alternating ones), and either may hold what the other lacks — the store what the
   * other instance sent, memory what this one sent when its save failed. Replacing either way
   * would push something again. Entries leave only by expiry, so a union loses nothing.
   */
  private async load(): Promise<void> {
    const saved = await this.store.get<unknown>(STATE);
    if (saved === null) return;
    if (!isSavedState(saved)) {
      this.logger.warn('notifier: saved state unreadable, keeping the state in memory');
      return;
    }
    const later = (a: number | null | undefined, b: number | null | undefined) =>
      a == null ? (b ?? null) : b == null ? a : Math.max(a, b);
    for (const [ref, expiresAt] of saved.seen) this.seen.set(ref, later(this.seen.get(ref), expiresAt)!);
    for (const [ref, expiresAt] of saved.quiet) {
      if (!this.seen.has(ref)) this.quiet.set(ref, later(this.quiet.get(ref), expiresAt)!);
    }
    for (const [ref] of this.quiet) if (this.seen.has(ref)) this.quiet.delete(ref);
    for (const [id, entry] of saved.notified) {
      const mine = this.notified.get(id);
      if (!mine || ALERT_LEVELS.indexOf(entry.level) > ALERT_LEVELS.indexOf(mine.level)) this.notified.set(id, entry);
    }
    for (const source of saved.warmed) this.warmed.add(source);
    this.state.lastSuccessAt = later(this.state.lastSuccessAt, saved.lastSuccessAt);
    this.state.lastRejectedAt = later(this.state.lastRejectedAt, saved.lastRejectedAt);
  }

  private async save(): Promise<void> {
    const state: SavedState = {
      version: 1,
      seen: [...this.seen],
      notified: [...this.notified],
      warmed: [...this.warmed],
      quiet: [...this.quiet],
      lastSuccessAt: this.state.lastSuccessAt,
      lastRejectedAt: this.state.lastRejectedAt,
    };
    await this.store.put(STATE, state);
  }

  private async check(): Promise<NotifyResult> {
    const now = this.now();
    for (const [ref, expiresAt] of this.seen) if (expiresAt <= now) this.seen.delete(ref);
    for (const [ref, expiresAt] of this.quiet) if (expiresAt <= now) this.quiet.delete(ref);
    for (const [id, entry] of this.notified) if (entry.expiresAt <= now) this.notified.delete(id);

    const warmUp = this.warmed.size === 0;
    const { warnings, read, failed: feedsFailed } = await this.source.listWarnings();
    this.state.feedsFailed = feedsFailed;
    if (read.length === 0 && feedsFailed.length > 0) {
      throw new ProviderError(
        `meteoalarm: all ${feedsFailed.length} feeds failed`,
        'Every warning feed failed; the next run tries again.',
      );
    }
    let notified = 0;
    let messages = 0;
    let rejected = 0;
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

      const data = fitPayload({
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
      });
      const ttlSeconds = Math.max(60, Math.round((expiresAt - now) / 1000));
      const batch = topicsForWarning(warning.areas, alert.type, alert.level).map((topic): PushMessage => ({
        topic,
        data: { ...data },
        ttlSeconds,
      }));
      // One warning at a time, recorded only once sent: a failure leaves just this warning
      // to retry, and never repeats the ones already pushed.
      try {
        const sent = await this.sender.send(batch);
        messages += sent.accepted;
        if (sent.rejected) {
          rejected += sent.rejected;
          // Recorded anyway: a malformed or oversized message fails the same way every run.
          this.logger.error(
            { warning: alert.id, rejected: sent.rejected, accepted: sent.accepted },
            'FCM refused messages for good',
          );
        }
      } catch {
        failed++;
        continue;
      }
      record();
      notified++;
      // Saved at once, not only at the end of the run: if the process stops mid-run (a deploy
      // cutting a long run), what was sent stays recorded. A failure here is retried by the
      // end of the run; memory keeps it meanwhile (load merges, never replaces).
      await this.save().catch(() => {});
    }

    for (const source of read) this.warmed.add(source);
    this.state.rejected = rejected;
    if (rejected) this.state.lastRejectedAt = now;
    if (failed) {
      throw new ProviderError(
        `FCM send failed for ${failed} warning(s)`,
        `${failed} warning(s) could not be sent; they are retried on the next run.`,
      );
    }
    if (feedsFailed.length === 0 && rejected === 0) {
      this.state.lastSuccessAt = now;
      this.state.lastError = null;
    } else {
      this.state.lastError = [
        feedsFailed.length ? `feeds failed: ${feedsFailed.join(', ')}` : '',
        rejected ? `${rejected} message(s) refused` : '',
      ]
        .filter(Boolean)
        .join('; ');
      this.logger.warn({ feedsFailed, rejected }, 'notifier run degraded');
    }
    return { warnings: warnings.length, notified, messages, warmUp, feedsRead: read.length, feedsFailed, rejected };
  }
}
