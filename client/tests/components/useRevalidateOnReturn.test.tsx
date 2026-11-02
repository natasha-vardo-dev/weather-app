import { act, cleanup, renderHook } from '@testing-library/react';
import { ApiError, ERROR_CODES } from '@weather/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, forecasts } from '../../src/api/client';
import { AIR_QUALITY_REFRESH_MS, useAirQuality } from '../../src/hooks/useAirQuality';
import { FORECAST_REFRESH_MS, useForecast } from '../../src/hooks/useForecast';
import { airQuality, forecast } from '../fixtures/weather';

vi.mock('../../src/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/client')>()),
  api: { getForecast: vi.fn(), getAirQuality: vi.fn() },
  forecasts: { sendAlone: vi.fn(), getForecast: vi.fn() },
}));

const getForecast = vi.mocked(api.getForecast);
const getBatchedForecast = vi.mocked(forecasts.getForecast);
const getAirQuality = vi.mocked(api.getAirQuality);

const START = Date.parse('2026-03-10T12:00:00Z');
const MINUTE = 60 * 1000;

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  if (online) window.dispatchEvent(new Event('online'));
}

/** Moves the clock while the tab is hidden, then brings it back into view. */
async function awayFor(ms: number) {
  act(() => setVisibility('hidden'));
  await act(() => vi.advanceTimersByTimeAsync(ms));
  act(() => setVisibility('visible'));
  await act(() => vi.advanceTimersByTimeAsync(0));
}

// The caches live for the whole module, so each test uses its own place.
let place = 0;
function nextPlace(): [number, number] {
  place += 1;
  return [40 + place, 10];
}

beforeEach(() => {
  vi.useFakeTimers({ now: START });
  getForecast.mockReset();
  getBatchedForecast.mockReset();
  getAirQuality.mockReset();
  setOnline(true);
  setVisibility('visible');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setOnline(true);
  setVisibility('visible');
});

describe('useForecast on return to the page', () => {
  it('loads again when the page comes back with an old forecast, keeping the old one meanwhile', async () => {
    const [lat, lon] = nextPlace();
    getForecast.mockResolvedValueOnce(forecast({ latitude: lat, longitude: lon }, { temperature: 5 }));
    const { result } = renderHook(() => useForecast(lat, lon));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.forecast?.current.temperature).toBe(5);

    let answer!: (value: ReturnType<typeof forecast>) => void;
    getForecast.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await awayFor(FORECAST_REFRESH_MS);

    expect(getForecast).toHaveBeenCalledTimes(2);
    // Still the old one, and no loading state over it.
    expect(result.current).toMatchObject({ loading: false, error: null });
    expect(result.current.forecast?.current.temperature).toBe(5);

    await act(async () => answer(forecast({ latitude: lat, longitude: lon }, { temperature: 9 })));
    expect(result.current.forecast?.current.temperature).toBe(9);
  });

  it('does not ask again when the forecast is newer than the server would have', async () => {
    const [lat, lon] = nextPlace();
    getForecast.mockResolvedValue(forecast({ latitude: lat, longitude: lon }));
    renderHook(() => useForecast(lat, lon));
    await act(() => vi.advanceTimersByTimeAsync(0));

    await awayFor(FORECAST_REFRESH_MS - MINUTE);

    expect(getForecast).toHaveBeenCalledTimes(1);
  });

  it('never asks by itself while the page stays in view', async () => {
    const [lat, lon] = nextPlace();
    getForecast.mockResolvedValue(forecast({ latitude: lat, longitude: lon }));
    renderHook(() => useForecast(lat, lon));
    await act(() => vi.advanceTimersByTimeAsync(3 * 60 * MINUTE));

    expect(getForecast).toHaveBeenCalledTimes(1);
  });

  it('keeps the shown forecast, without an error, when the new one fails', async () => {
    const [lat, lon] = nextPlace();
    getForecast
      .mockResolvedValueOnce(forecast({ latitude: lat, longitude: lon }, { temperature: 5 }))
      .mockRejectedValueOnce(new ApiError('down', ERROR_CODES.PROVIDER_ERROR, 502));
    const { result } = renderHook(() => useForecast(lat, lon));
    await act(() => vi.advanceTimersByTimeAsync(0));

    await awayFor(FORECAST_REFRESH_MS);

    expect(getForecast).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ loading: false, error: null });
    expect(result.current.forecast?.current.temperature).toBe(5);
  });

  it('waits for the connection when the page comes back offline', async () => {
    const [lat, lon] = nextPlace();
    getForecast.mockResolvedValue(forecast({ latitude: lat, longitude: lon }));
    renderHook(() => useForecast(lat, lon));
    await act(() => vi.advanceTimersByTimeAsync(0));

    setOnline(false);
    await awayFor(FORECAST_REFRESH_MS);
    expect(getForecast).toHaveBeenCalledTimes(1);

    act(() => setOnline(true));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(getForecast).toHaveBeenCalledTimes(2);
  });

  it('refreshes favourite tiles through the batch', async () => {
    const [lat, lon] = nextPlace();
    getBatchedForecast.mockResolvedValue(forecast({ latitude: lat, longitude: lon }));
    renderHook(() => useForecast(lat, lon, { batch: true }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    await awayFor(FORECAST_REFRESH_MS);

    expect(getBatchedForecast).toHaveBeenCalledTimes(2);
    expect(getForecast).not.toHaveBeenCalled();
  });
});

describe('useAirQuality on return to the page', () => {
  it('loads again only once the value is as old as the provider updates it', async () => {
    const [lat, lon] = nextPlace();
    getAirQuality.mockResolvedValue(airQuality(new Date(START)));
    renderHook(() => useAirQuality(lat, lon));
    await act(() => vi.advanceTimersByTimeAsync(0));

    await awayFor(FORECAST_REFRESH_MS);
    expect(getAirQuality).toHaveBeenCalledTimes(1);

    await awayFor(AIR_QUALITY_REFRESH_MS);
    expect(getAirQuality).toHaveBeenCalledTimes(2);
  });

  it('keeps the shown value when the new one fails', async () => {
    const [lat, lon] = nextPlace();
    getAirQuality.mockResolvedValueOnce(airQuality(new Date(START))).mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useAirQuality(lat, lon));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.airQuality?.summary).toBeDefined();

    await awayFor(AIR_QUALITY_REFRESH_MS);

    expect(getAirQuality).toHaveBeenCalledTimes(2);
    expect(result.current.airQuality?.summary).toBeDefined();
  });
});
