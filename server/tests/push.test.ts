import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { manageTopics, sendMessages } from '../src/providers/fcm.js';
import type {
  AlertBroadcastSource,
  BroadcastWarning,
  ProviderAlert,
  PushMessage,
  PushSender,
} from '../src/providers/types.js';
import { AlertNotifier, topicsForWarning } from '../src/services/alertNotifier.js';
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
      return messages.length;
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

describe('sendMessages', () => {
  const message: PushMessage = { topic: 'PL1261.all.yellow', data: { key: 'A' }, ttlSeconds: 60 };
  const answer =
    (...codes: (string | null)[]) =>
    async () => ({
      successCount: codes.filter((c) => c === null).length,
      responses: codes.map((code) => (code ? { success: false, error: { code, message: 'x' } } : { success: true })),
    });

  it('counts the accepted messages', async () => {
    expect(await sendMessages([message, message], answer(null, null))).toBe(2);
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
    expect(await sendMessages([message], answer('messaging/invalid-argument'))).toBe(0);
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
});
