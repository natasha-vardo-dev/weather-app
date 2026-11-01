import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp, NOTIFY_STALE_MS } from '../src/app.js';
import { silentLogger } from '../src/observability/logger.js';
import { FCM_TOPIC_LIMITS, Metrics } from '../src/observability/metrics.js';
import { manageTopics, sendMessages } from '../src/providers/fcm.js';
import type {
  AlertBroadcastSource,
  BroadcastWarning,
  ProviderAlert,
  PushMessage,
  PushSender,
} from '../src/providers/types.js';
import { AlertNotifier, fitPayload, MAX_PAYLOAD_BYTES, topicsForWarning } from '../src/services/alertNotifier.js';
import { MemoryStateStore, persistUsage } from '../src/services/stateStore.js';
import { cellKey, cellsCovering } from '../src/services/regions.js';
import { WeatherService } from '../src/services/weatherService.js';
import { createFakeProvider } from './fakeProvider.js';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const LATER = '2026-10-29T00:00:00Z';

function fakeSender() {
  const sent: PushMessage[] = [];
  const sender: PushSender & { sent: PushMessage[] } = {
    sent,
    subscribe: vi.fn(async () => {}),
    unsubscribe: vi.fn(async () => {}),
    send: vi.fn(async (messages: PushMessage[]) => {
      sent.push(...messages);
      return { accepted: messages.length, rejected: 0 };
    }),
  };
  return sender;
}

type Full = ProviderAlert & { replaces: string[] };

function alert(id: string, level: Full['level'], type: Full['type'] = 'wind', replaces: string[] = []): Full {
  return {
    id,
    level,
    type,
    onset: '2026-10-28T10:00:00Z',
    expires: LATER,
    replaces,
    texts: [{ language: 'en-GB', event: 'Wind', headline: 'Orange wind warning' }],
  };
}

/** A source whose warnings (and which feeds could be read) can be changed between runs. */
function fakeSource(initial: [BroadcastWarning, Full][] = []) {
  let warnings = new Map(initial.map(([w, a]) => [w.ref, { w, a }]));
  const source: AlertBroadcastSource & { set(list: [BroadcastWarning, Full][]): void; down: Set<string> } = {
    down: new Set(),
    areasAt: async () => ['PL1261'],
    listWarnings: async () => ({
      warnings: [...warnings.values()].map(({ w }) => w).filter((w) => !source.down.has(w.source)),
      read: ['PL', 'NO'].filter((country) => !source.down.has(country)),
      failed: ['PL', 'NO'].filter((country) => source.down.has(country)),
    }),
    loadWarning: async (ref) => warnings.get(ref)?.a ?? null,
    set(list) {
      warnings = new Map(list.map(([w, a]) => [w.ref, { w, a }]));
    },
  };
  return source;
}

const warning = (ref: string, areas = ['PL1261'], source = 'PL'): BroadcastWarning => ({
  ref,
  source,
  expires: LATER,
  areas,
});

describe('topicsForWarning', () => {
  it('reaches every minimum level it meets, and storm topics only for storms', () => {
    expect(topicsForWarning(['PL1261'], 'wind', 'orange')).toEqual([
      'PL1261.storm.yellow',
      'PL1261.storm.orange',
      'PL1261.all.yellow',
      'PL1261.all.orange',
    ]);
    expect(topicsForWarning(['PL1261'], 'fog', 'yellow')).toEqual(['PL1261.all.yellow']);
  });
});

describe('grid cells for drawn areas', () => {
  it('covers the cell of a place inside the area, even near its edge', () => {
    const ring: [number, number][] = [
      [10.6, 59.8],
      [10.9, 59.8],
      [10.9, 60.0],
      [10.6, 60.0],
      [10.6, 59.8],
    ];
    const cells = cellsCovering([[ring]]);
    expect(cells).toContain(cellKey(59.91, 10.75)); // Oslo
    expect(cells).toContain(cellKey(59.99, 10.89));
    expect(cells).not.toContain(cellKey(61, 10.75));
  });
});

describe('AlertNotifier', () => {
  it('only records the warnings in force on its first run, then pushes new ones once', async () => {
    const source = fakeSource([[warning('a'), alert('A', 'orange')]]);
    const sender = fakeSender();
    const notifier = new AlertNotifier(source, sender, () => NOW);

    expect(await notifier.run()).toMatchObject({ warmUp: true, messages: 0 });

    source.set([
      [warning('a'), alert('A', 'orange')],
      [warning('b'), alert('B', 'red', 'thunderstorm')],
    ]);
    expect(await notifier.run()).toMatchObject({ warmUp: false, notified: 1, messages: 6 });
    expect(sender.sent[0]!.data).toMatchObject({ key: 'B', level: 'red', type: 'thunderstorm' });
    expect(JSON.parse(sender.sent[0]!.data.texts!)).toEqual({
      'en-GB': { event: 'Wind', headline: 'Orange wind warning' },
    });

    expect(await notifier.run()).toMatchObject({ notified: 0, messages: 0 });
  });

  it('treats an update as the same warning: silent unless its level went up', async () => {
    const source = fakeSource();
    const sender = fakeSender();
    const notifier = new AlertNotifier(source, sender, () => NOW);
    await notifier.run(); // warm-up, nothing in force

    source.set([[warning('a'), alert('A', 'orange')]]);
    await notifier.run();
    expect(sender.sent).toHaveLength(4);

    // Same level, new version: no notification.
    source.set([[warning('a2'), alert('A2', 'orange', 'wind', ['A'])]]);
    expect(await notifier.run()).toMatchObject({ notified: 0 });

    // Raised to red: notified again, under the first version's key (same notification tag).
    source.set([[warning('a3'), alert('A3', 'red', 'wind', ['A2'])]]);
    expect(await notifier.run()).toMatchObject({ notified: 1 });
    expect(sender.sent.at(-1)!.data.key).toBe('A');
  });

  it('tries a warning it could not load again on the next run', async () => {
    const source = fakeSource();
    const sender = fakeSender();
    const notifier = new AlertNotifier(source, sender, () => NOW);
    await notifier.run();
    source.set([[warning('a'), alert('A', 'red')]]);
    const load = source.loadWarning;
    source.loadWarning = async () => {
      throw new Error('down');
    };
    expect(await notifier.run()).toMatchObject({ notified: 0 });
    source.loadWarning = load;
    expect(await notifier.run()).toMatchObject({ notified: 1 });
  });
});

describe('AlertNotifier when parts fail', () => {
  it('retries a warning whose sending failed, and fails the run so the scheduler shows it', async () => {
    const source = fakeSource();
    const sender = fakeSender();
    const notifier = new AlertNotifier(source, sender, () => NOW);
    await notifier.run();
    source.set([[warning('a'), alert('A', 'red')]]);
    const send = sender.send;
    sender.send = async () => {
      throw new Error('FCM down');
    };
    await expect(notifier.run()).rejects.toThrow(/retried/);
    sender.send = send;
    expect(await notifier.run()).toMatchObject({ notified: 1 });
    expect(await notifier.run()).toMatchObject({ notified: 0 });
  });

  it('does not push as new the warnings of a feed that failed during warm-up', async () => {
    const source = fakeSource([
      [warning('a'), alert('A', 'orange')],
      [warning('n', ['c240_42'], 'NO'), alert('N', 'red')],
    ]);
    const sender = fakeSender();
    const notifier = new AlertNotifier(source, sender, () => NOW);
    source.down.add('NO');
    await notifier.run(); // warm-up; Norway's feed is down
    source.down.clear();
    expect(await notifier.run()).toMatchObject({ notified: 0 }); // Norway read for the first time: recorded
    source.set([
      [warning('a'), alert('A', 'orange')],
      [warning('n', ['c240_42'], 'NO'), alert('N', 'red')],
      [warning('n2', ['c240_42'], 'NO'), alert('N2', 'yellow')],
    ]);
    expect(await notifier.run()).toMatchObject({ notified: 1 }); // a new Norwegian warning is pushed
  });

  it('does not push as new a warning in force at warm-up whose text failed to load then', async () => {
    const source = fakeSource([[warning('a'), alert('A', 'red')]]);
    const sender = fakeSender();
    const notifier = new AlertNotifier(source, sender, () => NOW);
    const load = source.loadWarning;
    source.loadWarning = async () => {
      throw new Error('down');
    };
    await notifier.run();
    source.loadWarning = load;
    expect(await notifier.run()).toMatchObject({ notified: 0 });
    expect(sender.sent).toHaveLength(0);
  });
});

describe('AlertNotifier recovery and status', () => {
  it('after a restart with saved state, pushes warnings issued while it was down, and nothing twice', async () => {
    const store = new MemoryStateStore(() => NOW);
    const source = fakeSource([[warning('a'), alert('A', 'orange')]]);
    const first = new AlertNotifier(source, fakeSender(), () => NOW, { store });
    await first.run();

    // Down: a new warning is issued; a new instance starts with the saved state.
    source.set([
      [warning('a'), alert('A', 'orange')],
      [warning('b'), alert('B', 'red')],
    ]);
    const sender = fakeSender();
    const restarted = new AlertNotifier(source, sender, () => NOW, { store });
    expect(await restarted.run()).toMatchObject({ warmUp: false, notified: 1 });
    expect(new Set(sender.sent.map((m) => m.data.key))).toEqual(new Set(['B']));
  });

  it('fails the run when every feed failed, instead of reporting no warnings', async () => {
    const source = fakeSource();
    const notifier = new AlertNotifier(source, fakeSender(), () => NOW);
    await notifier.run();
    source.down.add('PL').add('NO');
    await expect(notifier.run()).rejects.toThrow(/warning feed failed/);
    expect(notifier.status().lastError).toMatch(/all 2 feeds failed/);
  });

  it('reports a partial feed outage without counting the run as a success', async () => {
    let now = NOW;
    const source = fakeSource();
    const notifier = new AlertNotifier(source, fakeSender(), () => now);
    await notifier.run();
    expect(notifier.status().lastSuccessAt).toBe(NOW);
    now += 5 * 60_000;
    source.down.add('NO');
    expect(await notifier.run()).toMatchObject({ feedsRead: 1, feedsFailed: ['NO'] });
    expect(notifier.status()).toMatchObject({ lastSuccessAt: NOW, feedsFailed: ['NO'], lastRunAt: now });
  });

  it('counts messages FCM refused for good, records the warning and does not call it a success', async () => {
    const source = fakeSource();
    const sender = fakeSender();
    const notifier = new AlertNotifier(source, sender, () => NOW);
    await notifier.run();
    const before = notifier.status().lastSuccessAt;
    source.set([[warning('a'), alert('A', 'red')]]);
    sender.send = vi.fn(async (messages: PushMessage[]) => ({ accepted: 0, rejected: messages.length }));
    expect(await notifier.run()).toMatchObject({ notified: 1, rejected: 6 });
    expect(notifier.status()).toMatchObject({ rejected: 6, lastSuccessAt: before });
    // Not retried: it would be refused again.
    expect(await notifier.run()).toMatchObject({ notified: 0 });
  });

  it('skips a run while another instance holds the lease', async () => {
    const store = new MemoryStateStore(() => NOW);
    await store.lease('alert-notifier', 'other-instance', 60_000);
    const sender = fakeSender();
    const notifier = new AlertNotifier(fakeSource([[warning('a'), alert('A', 'red')]]), sender, () => NOW, { store });
    expect(await notifier.run()).toMatchObject({ skipped: true });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('never overwrites saved state when it could not read it', async () => {
    const store = new MemoryStateStore(() => NOW);
    await store.put('alert-notifier', {
      version: 1,
      seen: [],
      notified: [],
      warmed: ['PL'],
      quiet: [],
      lastSuccessAt: 1,
    });
    const failing = Object.assign(Object.create(store) as MemoryStateStore, {
      get: async () => {
        throw new Error('Firestore unavailable');
      },
      put: vi.fn(async () => {}),
    });
    const notifier = new AlertNotifier(fakeSource(), fakeSender(), () => NOW, { store: failing });
    await expect(notifier.run()).rejects.toThrow('Firestore unavailable');
    expect(failing.put).not.toHaveBeenCalled();
  });

  it('starts with a warm-up when the saved state is unreadable', async () => {
    const store = new MemoryStateStore(() => NOW);
    await store.put('alert-notifier', { version: 1, seen: 'broken' });
    const sender = fakeSender();
    const notifier = new AlertNotifier(fakeSource([[warning('a'), alert('A', 'red')]]), sender, () => NOW, { store });
    expect(await notifier.run()).toMatchObject({ warmUp: true, notified: 0 });
  });
});

describe('AlertNotifier across instances', () => {
  it('reads the saved state before every run, so instances taking turns never push twice', async () => {
    const store = new MemoryStateStore(() => NOW);
    const source = fakeSource();
    const senderA = fakeSender();
    const senderB = fakeSender();
    const a = new AlertNotifier(source, senderA, () => NOW, { store });
    const b = new AlertNotifier(source, senderB, () => NOW, { store });
    await a.run();
    source.set([[warning('w'), alert('W', 'red')]]);
    expect(await b.run()).toMatchObject({ notified: 1 });
    // The old instance gets the next call: it must know W was sent.
    expect(await a.run()).toMatchObject({ notified: 0 });
    expect(senderA.send).not.toHaveBeenCalled();
  });
});

describe('AlertNotifier cut midway', () => {
  it('has saved each warning as soon as it was sent, so a cut run repeats nothing', async () => {
    const store = new MemoryStateStore(() => NOW);
    const source = fakeSource();
    const sender = fakeSender();
    const notifier = new AlertNotifier(source, sender, () => NOW, { store });
    await notifier.run();
    source.set([
      [warning('a'), alert('A', 'red')],
      [warning('b'), alert('B', 'red')],
    ]);
    let calls = 0;
    sender.send = vi.fn(async (messages: PushMessage[]) => {
      // The second warning never finishes: the process is stopped there.
      if (++calls === 2) await new Promise(() => {});
      return { accepted: messages.length, rejected: 0 };
    });
    void notifier.run();
    await vi.waitFor(() => expect(calls).toBe(2));

    // A new instance, once the cut run's lease has run out.
    const later = NOW + 5 * 60_000;
    const next = fakeSender();
    const restarted = new AlertNotifier(source, next, () => later, {
      store: Object.assign(Object.create(store) as MemoryStateStore, {
        lease: (name: string, holder: string, ttl: number) =>
          new MemoryStateStore(() => later).lease(name, holder, ttl),
      }),
    });
    expect(await restarted.run()).toMatchObject({ notified: 1 });
    expect(new Set(next.sent.map((m) => m.data.key))).toEqual(new Set(['B']));
  });

  it('lets shutdown wait for a run under way', async () => {
    const source = fakeSource();
    const sender = fakeSender();
    let finish!: () => void;
    source.listWarnings = () =>
      new Promise((resolve) => (finish = () => resolve({ warnings: [], read: ['PL'], failed: [] })));
    const notifier = new AlertNotifier(source, sender, () => NOW);
    const run = notifier.run();
    let idle = false;
    void notifier.idle().then(() => (idle = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(idle).toBe(false);
    finish();
    await run;
    await vi.waitFor(() => expect(idle).toBe(true));
  });
});

describe('AlertNotifier when saving fails', () => {
  it('keeps what it sent when the save failed, so reading the older record never pushes it again', async () => {
    const store = new MemoryStateStore(() => NOW);
    const source = fakeSource();
    const sender = fakeSender();
    const notifier = new AlertNotifier(source, sender, () => NOW, { store });
    await notifier.run();

    source.set([[warning('w'), alert('W', 'red')]]);
    const put = store.put.bind(store);
    let failPuts = 2; // the save right after sending, and the run's own
    store.put = async (name, value) => {
      if (failPuts-- > 0) throw new Error('Firestore write failed');
      return put(name, value);
    };
    await expect(notifier.run()).rejects.toThrow(/Could not save the record/);
    expect(await notifier.run()).toMatchObject({ notified: 0 });
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(await store.get('alert-notifier')).toMatchObject({ seen: [['w', expect.any(Number)]] });
  });

  it('merges with what another instance saved meanwhile, pushing neither warning again', async () => {
    const store = new MemoryStateStore(() => NOW);
    const source = fakeSource();
    const senderA = fakeSender();
    const senderB = fakeSender();
    const a = new AlertNotifier(source, senderA, () => NOW, { store });
    const b = new AlertNotifier(source, senderB, () => NOW, { store });
    await a.run();

    // A sends X but cannot save it.
    source.set([[warning('x'), alert('X', 'red')]]);
    const put = store.put.bind(store);
    let failPuts = 2;
    store.put = async (name, value) => {
      if (failPuts-- > 0) throw new Error('Firestore write failed');
      return put(name, value);
    };
    await expect(a.run()).rejects.toThrow();

    // B (which never heard of X from the store) runs next and sends W, and X again: the
    // overlap price A's failed save leaves. Then A must push neither.
    source.set([
      [warning('x'), alert('X', 'red')],
      [warning('w'), alert('W', 'red')],
    ]);
    await b.run();
    expect(await a.run()).toMatchObject({ notified: 0 });
    expect(senderA.send).toHaveBeenCalledTimes(1);
    expect(await b.run()).toMatchObject({ notified: 0 });
  });
});

describe('persistUsage', () => {
  const failingOnce = () => {
    const store = new MemoryStateStore(() => NOW);
    let fail = true;
    const get = store.get.bind(store);
    store.get = async <T>(name: string) => {
      if (fail) {
        fail = false;
        throw new Error('Firestore unavailable');
      }
      return get<T>(name);
    };
    return store;
  };

  it('adds the saved counts back once, even when the first read outlasts a tick', async () => {
    vi.useFakeTimers({ now: NOW });
    try {
      const store = new MemoryStateStore(() => NOW);
      const before = new Metrics(silentLogger, () => NOW);
      before.provider('open-meteo', { perDay: 100 })(true, 40);
      await store.put('provider-usage', before.exportUsage());
      const get = store.get.bind(store);
      store.get = <T>(name: string) =>
        new Promise<T | null>((resolve) => setTimeout(() => resolve(get<T>(name)), 150_000));
      const metrics = new Metrics(silentLogger, () => Date.now());
      metrics.provider('open-meteo', { perDay: 100 });
      const usage = persistUsage(store, metrics, silentLogger, 60_000);
      await vi.advanceTimersByTimeAsync(200_000);
      expect(metrics.snapshot().providers['open-meteo']!.lastDay).toBe(40);
      usage.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never saves before the saved counts were read back, and retries reading them', async () => {
    vi.useFakeTimers({ now: NOW });
    try {
      const store = failingOnce();
      // A previous instance's counts.
      const before = new Metrics(silentLogger, () => NOW);
      before.provider('open-meteo', { perDay: 100 })(true, 80);
      await store.put('provider-usage', before.exportUsage());

      const metrics = new Metrics(silentLogger, () => Date.now());
      metrics.provider('open-meteo', { perDay: 100 })(true, 1);
      const usage = persistUsage(store, metrics, silentLogger, 60_000);
      await usage.ready;
      await usage.save();
      // The failed read did not let a save replace the 80 saved calls with this instance's 1.
      expect((await store.get<Record<string, unknown[]>>('provider-usage'))!['open-meteo']).toHaveLength(1);
      expect(metrics.snapshot().providers['open-meteo']!.lastDay).toBe(1);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(metrics.snapshot().providers['open-meteo']!.lastDay).toBe(81);
      await usage.save();
      const saved = new Metrics(silentLogger, () => Date.now());
      saved.provider('open-meteo', { perDay: 100 });
      saved.restoreUsage(await store.get('provider-usage'));
      expect(saved.snapshot().providers['open-meteo']!.lastDay).toBe(81);
      usage.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fitPayload', () => {
  const base = {
    key: 'k',
    level: 'orange' as const,
    type: 'wind' as const,
    onset: '2026-10-28T10:00:00Z',
    expires: LATER,
    areas: JSON.stringify(Array.from({ length: 60 }, (_, i) => `UA${1000 + i}`)),
  };

  it('keeps a payload that fits as it is', () => {
    const data = { ...base, texts: JSON.stringify({ en: { event: 'Wind', headline: 'Strong wind' } }) };
    expect(fitPayload(data)).toBe(data);
  });

  it("drops headlines, then areas, then extra languages, to stay under FCM's limit in any script", () => {
    const headline = 'Сильний вітер з поривами до 25 м/с'.repeat(5).slice(0, 160);
    const languages = ['uk', 'en', 'ru', 'pl', 'de', 'fr', 'es', 'it', 'ro', 'hu'];
    const texts = Object.fromEntries(languages.map((l) => [l, { event: 'Вітер '.repeat(20), headline }]));
    const fitted = fitPayload({ ...base, texts: JSON.stringify(texts) });
    const bytes = Object.entries(fitted).reduce((n, [k, v]) => n + Buffer.byteLength(k) + Buffer.byteLength(v), 0);
    expect(bytes).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
    expect(Object.values(JSON.parse(fitted.texts)).every((t) => !(t as { headline?: string }).headline)).toBe(true);
  });
});

describe('GET /api/health/notify', () => {
  it('is ok after a successful run and stale (503) once runs stop succeeding for long', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    try {
      const source = fakeSource();
      const notifier = new AlertNotifier(source, fakeSender(), () => Date.now());
      const server = createApp(new WeatherService(createFakeProvider()), {
        push: { source, sender: fakeSender(), notifier, notifySecret: 'secret-1234567890' },
      });
      await notifier.run();
      const ok = await request(server).get('/api/health/notify');
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ status: 'ok', store: 'memory', feedsFailed: [], rejected: 0 });
      expect(ok.headers['cache-control']).toBe('no-store');

      source.down.add('NO');
      vi.setSystemTime(NOW + NOTIFY_STALE_MS + 60_000);
      await notifier.run();
      const stale = await request(server).get('/api/health/notify');
      expect(stale.status).toBe(503);
      expect(stale.body).toMatchObject({ status: 'stale', feedsFailed: ['NO'] });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('GET /api/health/notify after refused messages', () => {
  it('stays 503 for the window after FCM refused messages, even when later runs are clean', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    try {
      const store = new MemoryStateStore(() => Date.now());
      const source = fakeSource();
      const sender = fakeSender();
      const notifier = new AlertNotifier(source, sender, () => Date.now(), { store });
      const server = createApp(new WeatherService(createFakeProvider()), {
        push: { source, sender, notifier, notifySecret: 'secret-1234567890' },
      });
      await notifier.run();
      source.set([[warning('a'), alert('A', 'red')]]);
      sender.send = vi.fn(async (messages: PushMessage[]) => ({ accepted: 0, rejected: messages.length }));
      await notifier.run();
      vi.setSystemTime(NOW + 5 * 60_000);
      await notifier.run(); // clean: nothing new
      const res = await request(server).get('/api/health/notify');
      expect(res.status).toBe(503);
      expect(res.body.lastRejectedAt).toBe(new Date(NOW).toISOString());
      // Kept across a restart.
      const restarted = new AlertNotifier(source, fakeSender(), () => Date.now(), { store });
      await restarted.run();
      expect(restarted.status().lastRejectedAt).toBe(NOW);

      vi.setSystemTime(NOW + NOTIFY_STALE_MS + 60_000);
      await notifier.run();
      expect((await request(server).get('/api/health/notify')).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('provider usage across restarts', () => {
  it('restores the last day of counts, so a restart does not reset the budget', () => {
    let now = NOW;
    const before = new Metrics(silentLogger, () => now);
    before.provider('open-meteo', { perDay: 100 })(true, 95);
    const saved = JSON.parse(JSON.stringify(before.exportUsage()));
    now += 60_000;
    const after = new Metrics(silentLogger, () => now);
    after.provider('open-meteo', { perDay: 100 });
    after.restoreUsage(saved);
    expect(after.snapshot().providers['open-meteo']!.lastDay).toBe(95);
    expect(() => after.budget('open-meteo')()).toThrow();
    // Malformed or older than a day: ignored.
    after.restoreUsage({
      'open-meteo': [
        ['x', 1, 0],
        [Math.floor(now / 60_000) - 2000, 50, 0],
      ],
    });
    expect(after.snapshot().providers['open-meteo']!.lastDay).toBe(95);
  });
});

describe('sendMessages', () => {
  const message: PushMessage = { topic: 'PL1261.all.yellow', data: { key: 'A' }, ttlSeconds: 60 };
  const answer =
    (...codes: (string | null)[]) =>
    async () => ({
      successCount: codes.filter((c) => c === null).length,
      responses: codes.map((code) => (code ? { success: false, error: { code, message: 'x' } } : { success: true })),
    });

  it('counts the accepted messages', async () => {
    expect(await sendMessages([message, message], answer(null, null))).toEqual({ accepted: 2, rejected: 0 });
  });

  it('fails on a transient rejection, so the warning is retried, even though sendEach resolved', async () => {
    await expect(sendMessages([message], answer('messaging/server-unavailable'))).rejects.toBeInstanceOf(Error);
    await expect(sendMessages([message, message], answer(null, 'messaging/quota-exceeded'))).rejects.toBeInstanceOf(
      Error,
    );
    // A lost connection: firebase-admin reports it per message, not by throwing.
    await expect(sendMessages([message], answer('app/network-error'))).rejects.toBeInstanceOf(Error);
    await expect(sendMessages([message], answer('app/network-timeout'))).rejects.toBeInstanceOf(Error);
  });

  it('does not retry a message that would fail the same way every run', async () => {
    expect(await sendMessages([message], answer('messaging/invalid-argument'))).toEqual({ accepted: 0, rejected: 1 });
  });
});

describe('manageTopics', () => {
  const dead = async () => ({
    failureCount: 1,
    errors: [{ error: { code: 'messaging/registration-token-not-registered', message: 'gone' } }],
  });

  it('asks for a new token when subscribing with one FCM no longer knows', async () => {
    await expect(manageTopics(['PL1261.all.yellow'], dead, 'subscribe')).rejects.toMatchObject({ status: 400 });
  });

  it('lets a dead token unsubscribe, so notifications can always be turned off', async () => {
    await expect(manageTopics(['PL1261.all.yellow'], dead, 'unsubscribe')).resolves.toBeUndefined();
  });
});

describe('push routes', () => {
  function app(sender = fakeSender(), source = fakeSource()) {
    const notifier = new AlertNotifier(source, sender, () => NOW);
    return {
      sender,
      app: createApp(new WeatherService(createFakeProvider()), {
        push: { source, sender, notifier, notifySecret: 'secret-1234567890' },
      }),
    };
  }
  const body = {
    token: 'x'.repeat(40),
    latitude: 50.06,
    longitude: 19.94,
    group: 'storm',
    level: 'orange',
    subscribe: true,
  };

  it('subscribes a device to its areas, never cached', async () => {
    const { app: server, sender } = app();
    const res = await request(server).post('/api/v1/push/topics').send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ areas: ['PL1261'] });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(sender.subscribe).toHaveBeenCalledWith(body.token, ['PL1261.storm.orange']);
  });

  it('unsubscribes the same topics, and validates the request', async () => {
    const { app: server, sender } = app();
    await request(server)
      .post('/api/v1/push/topics')
      .send({ ...body, subscribe: false });
    expect(sender.unsubscribe).toHaveBeenCalledWith(body.token, ['PL1261.storm.orange']);
    expect(
      (
        await request(server)
          .post('/api/v1/push/topics')
          .send({ ...body, level: 'green' })
      ).status,
    ).toBe(400);
  });

  it('answers a broken or oversized body with a client error, not a 500', async () => {
    const { app: server } = app();
    const broken = await request(server).post('/api/v1/push/topics').set('Content-Type', 'application/json').send('{');
    expect(broken.status).toBe(400);
    expect(broken.body.error.code).toBe('INVALID_REQUEST');
    const missing = await request(server).post('/api/v1/push/topics');
    expect(missing.status).toBe(400);
    const huge = await request(server)
      .post('/api/v1/push/topics')
      .send({ ...body, token: 'x'.repeat(9000) });
    expect(huge.status).toBe(413);
  });

  it('runs the check only with the secret', async () => {
    const { app: server } = app();
    expect((await request(server).post('/api/internal/alerts/notify')).status).toBe(404);
    const res = await request(server)
      .post('/api/internal/alerts/notify')
      .set('Authorization', 'Bearer secret-1234567890');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ warmUp: true });
  });

  describe('abuse limits', () => {
    function guarded(guard: { perTokenPerHour: number; concurrency: number }, metrics?: Metrics) {
      const sender = fakeSender();
      const server = createApp(new WeatherService(createFakeProvider()), {
        push: { source: fakeSource(), sender, guard },
        metrics,
        rateLimits: false,
      });
      return { server, sender };
    }

    it('limits changes per token, whatever address they come from', async () => {
      const { server, sender } = guarded({ perTokenPerHour: 2, concurrency: 4 });
      expect((await request(server).post('/api/v1/push/topics').send(body)).status).toBe(200);
      expect(
        (
          await request(server)
            .post('/api/v1/push/topics')
            .send({ ...body, level: 'red' })
        ).status,
      ).toBe(200);
      const third = await request(server).post('/api/v1/push/topics').send(body);
      expect(third.status).toBe(429);
      expect(third.body.error.code).toBe('RATE_LIMITED');
      expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
      // Another device is not affected.
      expect(
        (
          await request(server)
            .post('/api/v1/push/topics')
            .send({ ...body, token: 'y'.repeat(40) })
        ).status,
      ).toBe(200);
      expect(sender.subscribe).toHaveBeenCalledTimes(3);
    });

    it('joins the same change already under way instead of repeating it', async () => {
      const { server, sender } = guarded({ perTokenPerHour: 10, concurrency: 4 });
      let release!: () => void;
      vi.mocked(sender.subscribe).mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
      const first = request(server)
        .post('/api/v1/push/topics')
        .send(body)
        .then((r) => r.status);
      const second = request(server)
        .post('/api/v1/push/topics')
        .send(body)
        .then((r) => r.status);
      await vi.waitFor(() => expect(sender.subscribe).toHaveBeenCalled());
      // Give the second request time to arrive and join.
      await new Promise((resolve) => setTimeout(resolve, 50));
      release();
      expect(await Promise.all([first, second])).toEqual([200, 200]);
      expect(sender.subscribe).toHaveBeenCalledTimes(1);
    });

    it('refuses new changes once the global Firebase budget is spent (503)', async () => {
      let now = NOW;
      const metrics = new Metrics(silentLogger, () => now);
      const { server, sender } = guarded({ perTokenPerHour: 10_000, concurrency: 4 }, metrics);
      // Spend 90% of the per-minute cap, as other devices would.
      const record = metrics.provider('fcm-topics', FCM_TOPIC_LIMITS);
      record(true, FCM_TOPIC_LIMITS.perMinute! * 0.9);
      const res = await request(server).post('/api/v1/push/topics').send(body);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('SERVICE_BUSY');
      expect(sender.subscribe).not.toHaveBeenCalled();
      now += 2 * 60_000;
      expect((await request(server).post('/api/v1/push/topics').send(body)).status).toBe(200);
      expect(metrics.snapshot().providers['fcm-topics']!.lastMinute).toBe(1);
    });

    it('always lets a device turn notifications off, budget spent or token busy', async () => {
      const metrics = new Metrics(silentLogger, () => NOW);
      const { server, sender } = guarded({ perTokenPerHour: 1, concurrency: 4 }, metrics);
      expect((await request(server).post('/api/v1/push/topics').send(body)).status).toBe(200);
      metrics.provider('fcm-topics', FCM_TOPIC_LIMITS)(true, FCM_TOPIC_LIMITS.perMinute!);
      expect((await request(server).post('/api/v1/push/topics').send(body)).status).toBe(429);
      const off = await request(server)
        .post('/api/v1/push/topics')
        .send({ ...body, subscribe: false });
      expect(off.status).toBe(200);
      expect(sender.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('refuses a queued change once the budget is spent by the calls ahead of it', async () => {
      const metrics = new Metrics(silentLogger, () => NOW);
      const record = metrics.provider('fcm-topics', FCM_TOPIC_LIMITS);
      const { server, sender } = guarded({ perTokenPerHour: 100, concurrency: 1 }, metrics);
      let release!: () => void;
      vi.mocked(sender.subscribe).mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => (release = resolve));
        // The call ahead spends the rest of the budget.
        record(true, FCM_TOPIC_LIMITS.perMinute!);
      });
      const first = request(server)
        .post('/api/v1/push/topics')
        .send(body)
        .then((r) => r.status);
      await vi.waitFor(() => expect(sender.subscribe).toHaveBeenCalledTimes(1));
      const queued = request(server)
        .post('/api/v1/push/topics')
        .send({ ...body, token: 'q'.repeat(40) })
        .then((r) => r.status);
      await new Promise((resolve) => setTimeout(resolve, 50));
      release();
      expect(await Promise.all([first, queued])).toEqual([200, 503]);
      expect(sender.subscribe).toHaveBeenCalledTimes(1);
    });

    it('gives the slot back when a change did not take effect', async () => {
      const { server, sender } = guarded({ perTokenPerHour: 1, concurrency: 4 });
      vi.mocked(sender.subscribe).mockRejectedValueOnce(new Error('FCM down'));
      expect((await request(server).post('/api/v1/push/topics').send(body)).status).toBe(500);
      expect((await request(server).post('/api/v1/push/topics').send(body)).status).toBe(200);
      expect((await request(server).post('/api/v1/push/topics').send(body)).status).toBe(429);
    });

    it('has a per-IP limit of its own', async () => {
      const server = createApp(new WeatherService(createFakeProvider()), {
        push: { source: fakeSource(), sender: fakeSender() },
        rateLimits: { api: 100, forecasts: 10, search: 10, places: 10, clientErrors: 10, push: 1 },
      });
      expect((await request(server).post('/api/v1/push/topics').send(body)).status).toBe(200);
      expect(
        (
          await request(server)
            .post('/api/v1/push/topics')
            .send({ ...body, token: 'z'.repeat(40) })
        ).status,
      ).toBe(429);
    });
  });
});
