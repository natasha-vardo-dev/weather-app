import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pushAvailability } from '../src/push/availability';
import { latestOnly } from '../src/push/latestOnly';
import {
  ALERT_SUBSCRIPTIONS_KEY,
  findAlertSubscription,
  getAlertSubscriptions,
  parseAlertSubscriptions,
  removeAlertSubscription,
  saveAlertSubscription,
  type AlertSubscription,
} from '../src/push/alertSubscriptions';

describe('pushAvailability', () => {
  const base = {
    configured: true,
    ios: false,
    standalone: false,
    pushApi: true,
    permission: 'default' as const,
    devServer: false,
  };

  it('hides the bell without Firebase or the Push API', () => {
    expect(pushAvailability({ ...base, configured: false })).toBe('off');
    expect(pushAvailability({ ...base, pushApi: false })).toBe('unsupported');
  });

  it('asks iPhone users to install first, and explains a block', () => {
    expect(pushAvailability({ ...base, ios: true })).toBe('ios-install');
    expect(pushAvailability({ ...base, ios: true, standalone: true })).toBe('available');
    expect(pushAvailability({ ...base, permission: 'denied' })).toBe('blocked');
  });

  it('says up front that the development server has no service worker', () => {
    expect(pushAvailability({ ...base, devServer: true })).toBe('dev-server');
  });
});

const krakow: AlertSubscription = {
  latitude: 50.06,
  longitude: 19.94,
  name: 'Kraków',
  url: '/weather/50.06,19.94?name=Krak%C3%B3w',
  group: 'storm',
  level: 'orange',
  areas: ['PL1261'],
};

describe('alert subscriptions store', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  });

  it('saves one entry per place (~1 km) with its token, and removes it', () => {
    saveAlertSubscription('token-1', krakow);
    saveAlertSubscription('token-1', { ...krakow, latitude: 50.061, level: 'red' });
    expect(getAlertSubscriptions().places).toHaveLength(1);
    expect(findAlertSubscription(krakow)?.level).toBe('red');
    expect(getAlertSubscriptions().token).toBe('token-1');
    removeAlertSubscription(krakow);
    expect(findAlertSubscription(krakow)).toBeUndefined();
  });

  it('drops malformed or unsafe entries from storage', () => {
    expect(
      parseAlertSubscriptions({
        token: 'x',
        places: [krakow, { ...krakow, level: 'green' }, { ...krakow, url: 'https://evil.example' }, null],
      }).places,
    ).toEqual([krakow]);
    localStorage.setItem(ALERT_SUBSCRIPTIONS_KEY, '{oops');
    expect(getAlertSubscriptions()).toEqual({ token: null, places: [] });
  });
});

describe('latestOnly', () => {
  function deferred() {
    let resolve!: () => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<void>((res, rej) => ((resolve = res), (reject = rej)));
    return { promise, resolve, reject };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('runs the first and then only the latest of quick changes', async () => {
    const started: string[] = [];
    const idle = vi.fn();
    const run = latestOnly({ onStart: () => started.push('start'), onIdle: idle });
    const first = deferred();
    run(() => (started.push('storm'), first.promise));
    run(async () => void started.push('all'));
    run(async () => void started.push('red'));
    first.resolve();
    await flush();
    expect(started).toEqual(['start', 'storm', 'red']);
    expect(idle).toHaveBeenCalledOnce();
    expect(idle).toHaveBeenCalledWith(null);
  });

  it('reports a failure only if the last change failed', async () => {
    const idle = vi.fn();
    const run = latestOnly({ onStart: () => {}, onIdle: idle });
    const first = deferred();
    run(() => first.promise);
    run(async () => {});
    first.reject(new Error('network'));
    await flush();
    expect(idle).toHaveBeenLastCalledWith(null);

    run(async () => {
      throw new Error('network');
    });
    await flush();
    expect(idle).toHaveBeenLastCalledWith(new Error('network'));
  });
});
