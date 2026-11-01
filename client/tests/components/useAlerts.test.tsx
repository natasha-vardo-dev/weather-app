import { act, cleanup, renderHook } from '@testing-library/react';
import type { AlertsResponse, WeatherAlert } from '@weather/shared';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../src/api/client';
import { ALERTS_REFRESH_MS, useAlertLevel, useAlerts } from '../../src/hooks/useAlerts';
import { I18nProvider } from '../../src/i18n/I18nProvider';
import { noAlerts } from '../fixtures/weather';

vi.mock('../../src/api/client', () => ({ api: { getAlerts: vi.fn() } }));

const getAlerts = vi.mocked(api.getAlerts);

const START = Date.parse('2026-03-10T12:00:00Z');
const MINUTE = 60 * 1000;

function alert(id: string, level: WeatherAlert['level'], expiresInMs: number): WeatherAlert {
  return {
    id,
    level,
    type: 'wind',
    onset: new Date(START - MINUTE).toISOString(),
    expires: new Date(START + expiresInMs).toISOString(),
    language: 'en-GB',
    event: 'Event',
  };
}

const withAlerts = (...alerts: WeatherAlert[]): AlertsResponse => ({ ...noAlerts, alerts });

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Runs timers and the promises they start, inside act so React applies the updates. */
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

// The cache lives for the whole module, so each test uses its own place.
let place = 0;
function nextPlace(): [number, number] {
  place += 1;
  return [50 + place, 20];
}

beforeEach(() => {
  vi.useFakeTimers({ now: START });
  getAlerts.mockReset();
  // Later refreshes, after the answers a test lines up.
  getAlerts.mockResolvedValue(noAlerts);
  localStorage.setItem('language', 'en');
  setVisibility('visible');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setVisibility('visible');
});

describe('useAlerts', () => {
  it('shows a newly issued warning after the refresh interval', async () => {
    const [lat, lon] = nextPlace();
    getAlerts.mockResolvedValueOnce(noAlerts).mockResolvedValueOnce(withAlerts(alert('new', 'orange', 60 * MINUTE)));
    const { result } = renderHook(() => useAlerts(lat, lon), { wrapper });
    await advance(0);
    expect(result.current?.alerts).toEqual([]);

    await advance(ALERTS_REFRESH_MS);

    expect(getAlerts).toHaveBeenCalledTimes(2);
    expect(result.current?.alerts.map((a) => a.id)).toEqual(['new']);
  });

  it('does not ask while the tab is hidden, and asks once it is visible again', async () => {
    const [lat, lon] = nextPlace();
    renderHook(() => useAlerts(lat, lon), { wrapper });
    await advance(0);
    expect(getAlerts).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    await advance(10 * MINUTE);
    expect(getAlerts).toHaveBeenCalledTimes(1);

    act(() => setVisibility('visible'));
    await advance(0);
    expect(getAlerts).toHaveBeenCalledTimes(2);
  });

  it('does not ask again on becoming visible while the answer is fresh', async () => {
    const [lat, lon] = nextPlace();
    renderHook(() => useAlerts(lat, lon), { wrapper });
    await advance(0);

    setVisibility('hidden');
    await advance(2 * MINUTE);
    act(() => setVisibility('visible'));
    await advance(0);
    expect(getAlerts).toHaveBeenCalledTimes(1);
  });

  it('keeps the last answer after a failed refresh and asks again when back online', async () => {
    const [lat, lon] = nextPlace();
    const first = withAlerts(alert('a', 'yellow', 60 * MINUTE));
    getAlerts.mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(noAlerts);
    const { result } = renderHook(() => useAlerts(lat, lon), { wrapper });
    await advance(0);

    await advance(ALERTS_REFRESH_MS);
    expect(getAlerts).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(first);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await advance(0);
    expect(getAlerts).toHaveBeenCalledTimes(3);
    expect(result.current?.alerts).toEqual([]);
  });

  it('waits for a hidden tab to be shown before asking after the connection returns', async () => {
    const [lat, lon] = nextPlace();
    renderHook(() => useAlerts(lat, lon), { wrapper });
    await advance(0);
    setVisibility('hidden');
    await advance(ALERTS_REFRESH_MS);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await advance(0);
    expect(getAlerts).toHaveBeenCalledTimes(1);
    act(() => setVisibility('visible'));
    await advance(0);
    expect(getAlerts).toHaveBeenCalledTimes(2);
  });

  it('waits a whole interval after a failed refresh instead of asking again at once', async () => {
    const [lat, lon] = nextPlace();
    renderHook(() => useAlerts(lat, lon), { wrapper });
    await advance(0);
    getAlerts.mockRejectedValue(new Error('offline'));
    await advance(ALERTS_REFRESH_MS);
    expect(getAlerts).toHaveBeenCalledTimes(2);
    await advance(ALERTS_REFRESH_MS - 1000);
    expect(getAlerts).toHaveBeenCalledTimes(2);
    await advance(1000);
    expect(getAlerts).toHaveBeenCalledTimes(3);
  });

  it('asks no more often than the server refreshes its feeds', async () => {
    const [lat, lon] = nextPlace();
    renderHook(() => useAlerts(lat, lon), { wrapper });
    await advance(0);
    await advance(ALERTS_REFRESH_MS - 1000);
    expect(getAlerts).toHaveBeenCalledTimes(1);
    await advance(1000);
    expect(getAlerts).toHaveBeenCalledTimes(2);
  });

  it('sends one request for every component showing the same place', async () => {
    const [lat, lon] = nextPlace();
    getAlerts.mockResolvedValue(withAlerts(alert('a', 'red', 60 * MINUTE)));
    const page = renderHook(() => useAlerts(lat, lon), { wrapper });
    const tile = renderHook(() => useAlertLevel(lat, lon), { wrapper });
    const card = renderHook(() => useAlertLevel(lat, lon), { wrapper });
    await advance(0);
    expect(getAlerts).toHaveBeenCalledTimes(1);
    expect(tile.result.current).toBe('red');

    await advance(ALERTS_REFRESH_MS);
    expect(getAlerts).toHaveBeenCalledTimes(2);
    await advance(3 * ALERTS_REFRESH_MS);
    expect(getAlerts).toHaveBeenCalledTimes(5);
    expect(page.result.current?.alerts).toHaveLength(1);
    expect(card.result.current).toBe('red');
  });
});

describe('useAlertLevel', () => {
  it('ignores an expired warning', async () => {
    const [lat, lon] = nextPlace();
    // Refreshes keep returning the expired red warning, as the feed does for a while.
    getAlerts.mockResolvedValue(withAlerts(alert('red', 'red', 30 * 1000), alert('yellow', 'yellow', 60 * MINUTE)));
    const { result } = renderHook(() => useAlertLevel(lat, lon), { wrapper });
    await advance(0);
    expect(result.current).toBe('red');

    await advance(MINUTE);
    expect(result.current).toBe('yellow');
  });
});
