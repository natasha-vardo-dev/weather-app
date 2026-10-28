import type { AlertTopicsRequest } from '@weather/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api/client';
import { ALERT_SUBSCRIPTIONS_KEY, getAlertSubscriptions } from '../src/push/alertSubscriptions';
import { disableAlerts, enableAlerts, PushError, renewAlertsToken } from '../src/push/pushClient';

vi.mock('../src/api/client', () => ({ api: { setAlertTopics: vi.fn() } }));
vi.mock('../src/push/config', () => ({
  firebaseConfig: { apiKey: 'k', projectId: 'p', messagingSenderId: 's', appId: 'a', vapidKey: 'v' },
}));
const token = { current: 'token-new' };
vi.mock('firebase/app', () => ({ getApps: () => [{}], initializeApp: () => ({}) }));
vi.mock('firebase/messaging', () => ({
  isSupported: async () => true,
  getMessaging: () => ({}),
  getToken: async () => token.current,
}));

const setAlertTopics = vi.mocked(api.setAlertTopics);
const KRAKOW = { latitude: 50.06, longitude: 19.94, name: 'Kraków', url: '/weather/50.06,19.94', timeZone: 'Europe/Warsaw' };
const WARSAW = { latitude: 52.23, longitude: 21.01, name: 'Warsaw', url: '/weather/52.23,21.01', timeZone: 'Europe/Warsaw' };

function stored(tokenValue: string, places: object[]) {
  localStorage.setItem(ALERT_SUBSCRIPTIONS_KEY, JSON.stringify({ token: tokenValue, places }));
}

const calls = () => setAlertTopics.mock.calls.map(([body]) => body as AlertTopicsRequest);

describe('enableAlerts', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: async () => 'granted' });
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({}) } });
    setAlertTopics.mockReset();
    setAlertTopics.mockResolvedValue({ areas: ['PL1261'] });
    token.current = 'token-new';
  });

  it('joins the new topic before leaving the old one when settings change', async () => {
    stored('token-new', [{ ...KRAKOW, group: 'storm', level: 'orange', areas: ['PL1261'] }]);
    await enableAlerts(KRAKOW, { group: 'all', level: 'yellow' });
    expect(calls().map((c) => [c.subscribe, c.group, c.level])).toEqual([
      [true, 'all', 'yellow'],
      [false, 'storm', 'orange'],
    ]);
    expect(getAlertSubscriptions().places[0]).toMatchObject({ group: 'all', level: 'yellow' });
  });

  it('keeps the old settings, still subscribed, when joining the new topic fails', async () => {
    stored('token-new', [{ ...KRAKOW, group: 'storm', level: 'orange', areas: ['PL1261'] }]);
    setAlertTopics.mockRejectedValueOnce(new Error('offline'));
    await expect(enableAlerts(KRAKOW, { group: 'all', level: 'yellow' })).rejects.toBeInstanceOf(PushError);
    expect(calls().every((c) => c.subscribe)).toBe(true); // never left the old topic
    expect(getAlertSubscriptions().places[0]).toMatchObject({ group: 'storm', level: 'orange' });
  });

  it('remembers an old topic it failed to leave, and leaves it when turned off', async () => {
    stored('token-new', [{ ...KRAKOW, group: 'all', level: 'yellow', areas: ['PL1261'] }]);
    setAlertTopics.mockResolvedValueOnce({ areas: ['PL1261'] }).mockRejectedValueOnce(new Error('502'));
    await enableAlerts(KRAKOW, { group: 'storm', level: 'orange' });
    expect(getAlertSubscriptions().leave).toEqual([
      { token: 'token-new', latitude: KRAKOW.latitude, longitude: KRAKOW.longitude, group: 'all', level: 'yellow' },
    ]);

    setAlertTopics.mockClear();
    await disableAlerts(KRAKOW);
    // The broader old topic (all from yellow) is left too, not only the current one.
    expect(calls().map((c) => [c.subscribe, c.group, c.level])).toEqual([
      [false, 'all', 'yellow'],
      [false, 'storm', 'orange'],
    ]);
    expect(getAlertSubscriptions()).toEqual({ token: 'token-new', places: [] });
  });

  it('never leaves the topic just joined when switching back to a setting whose leave was pending', async () => {
    stored('token-new', [{ ...KRAKOW, group: 'all', level: 'yellow', areas: ['PL1261'] }]);
    setAlertTopics.mockResolvedValueOnce({ areas: ['PL1261'] }).mockRejectedValueOnce(new Error('502'));
    await enableAlerts(KRAKOW, { group: 'storm', level: 'orange' }); // leaving all/yellow failed

    setAlertTopics.mockReset();
    setAlertTopics
      .mockRejectedValueOnce(new Error('502')) // the pending leave of all/yellow fails again
      .mockResolvedValue({ areas: ['PL1261'] });
    await enableAlerts(KRAKOW, { group: 'all', level: 'yellow' });
    const afterJoin = calls().slice(calls().findIndex((c) => c.subscribe));
    expect(afterJoin.map((c) => [c.subscribe, c.group, c.level])).toEqual([
      [true, 'all', 'yellow'],
      [false, 'storm', 'orange'],
    ]);
    expect(getAlertSubscriptions().leave).toBeUndefined();
    expect(getAlertSubscriptions().places[0]).toMatchObject({ group: 'all', level: 'yellow' });
  });

  it('sends one unsubscribe per settings change', async () => {
    stored('token-new', [{ ...KRAKOW, group: 'storm', level: 'orange', areas: ['PL1261'] }]);
    await enableAlerts(KRAKOW, { group: 'all', level: 'yellow' });
    expect(calls().filter((c) => !c.subscribe)).toHaveLength(1);
    expect(getAlertSubscriptions().leave).toBeUndefined();
  });

  it('does not let a token renewal on start undo a setting changed meanwhile', async () => {
    stored('token-old', [{ ...KRAKOW, group: 'all', level: 'yellow', areas: ['PL1261'] }]);
    let release!: () => void;
    const slow = new Promise<void>((resolve) => (release = resolve));
    setAlertTopics.mockImplementationOnce(async () => {
      await slow; // the renewal's re-subscribe is still in flight...
      return { areas: ['PL1261'] };
    });
    const renewal = renewAlertsToken();
    const change = enableAlerts(KRAKOW, { group: 'storm', level: 'orange' }); // ...when the user changes it
    await Promise.resolve();
    release();
    await Promise.all([renewal, change]);
    const state = getAlertSubscriptions();
    expect(state.token).toBe('token-new');
    expect(state.places).toHaveLength(1);
    expect(state.places[0]).toMatchObject({ group: 'storm', level: 'orange' });
    // The change ran after the renewal: joined storm/orange, then left all/yellow.
    expect(calls().map((c) => [c.subscribe, c.group])).toEqual([
      [true, 'all'],
      [true, 'storm'],
      [false, 'all'],
    ]);
  });

  it('moves the other places to a new token before subscribing this one', async () => {
    stored('token-old', [{ ...WARSAW, group: 'storm', level: 'orange', areas: ['PL1465'] }]);
    await enableAlerts(KRAKOW, { group: 'storm', level: 'orange' });
    expect(calls().map((c) => [c.token, c.latitude])).toEqual([
      ['token-new', WARSAW.latitude],
      ['token-new', KRAKOW.latitude],
    ]);
    const state = getAlertSubscriptions();
    expect(state.token).toBe('token-new');
    expect(state.places.map((p) => p.name).sort()).toEqual(['Kraków', 'Warsaw']);
  });
});
