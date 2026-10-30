import { ApiError, type Forecast, type ForecastsResponse } from '@weather/shared';
import { describe, expect, it, vi } from 'vitest';
import { createForecastBatcher } from '../src/api/forecastBatch';
import { isSavedValue, markSavedValue } from '../src/api/savedResponses';

const at = (latitude: number): Forecast => ({ latitude }) as Forecast;

function setup(answer?: (places: { latitude: number }[]) => Promise<ForecastsResponse>) {
  const client = {
    getForecast: vi.fn(async (latitude: number) => at(latitude)),
    getForecasts: vi.fn(
      answer ??
        (async (places: { latitude: number }[]) => ({ forecasts: places.map((p) => ({ forecast: at(p.latitude) })) })),
    ),
  };
  let flush = () => {};
  const batcher = createForecastBatcher(client, (f) => (flush = f));
  return { client, batcher, flush: () => flush() };
}

describe('createForecastBatcher', () => {
  it('sends forecasts asked for together as one request, and gives each its own', async () => {
    const { client, batcher, flush } = setup();
    const results = [1, 2, 3].map((lat) => batcher.getForecast(lat, 0));
    flush();

    expect(await Promise.all(results)).toEqual([at(1), at(2), at(3)]);
    expect(client.getForecasts).toHaveBeenCalledTimes(1);
    expect(client.getForecasts.mock.calls[0]![0]).toEqual([
      expect.objectContaining({ latitude: 1, longitude: 0 }),
      expect.objectContaining({ latitude: 2, longitude: 0 }),
      expect.objectContaining({ latitude: 3, longitude: 0 }),
    ]);
    expect(client.getForecast).not.toHaveBeenCalled();
  });

  it('asks for a single place on its own, as before', async () => {
    const { client, batcher, flush } = setup();
    const result = batcher.getForecast(52, 21);
    flush();
    expect(await result).toEqual(at(52));
    expect(client.getForecasts).not.toHaveBeenCalled();
  });

  it('splits more places than the API takes into several requests', async () => {
    const { client, batcher, flush } = setup();
    const results = Array.from({ length: 12 }, (_, i) => batcher.getForecast(i, 0));
    flush();
    await Promise.all(results);
    // Ten, then the last two as a batch of their own.
    expect(client.getForecasts.mock.calls.map(([places]) => places.length)).toEqual([10, 2]);
    expect(client.getForecast).not.toHaveBeenCalled();
  });

  it('fails only the places that failed', async () => {
    const { batcher, flush } = setup(async () => ({
      forecasts: [{ forecast: at(1) }, { error: { code: 'PROVIDER_ERROR', message: 'down' } }],
    }));
    const [ok, failed] = [batcher.getForecast(1, 0), batcher.getForecast(2, 0)];
    flush();
    expect(await ok).toEqual(at(1));
    await expect(failed).rejects.toMatchObject({ name: 'ApiError', code: 'PROVIDER_ERROR' });
  });

  it('falls back to one request each when the server has no batch endpoint yet', async () => {
    const { client, batcher, flush } = setup(async () => {
      throw new ApiError('Endpoint not found.', 'NOT_FOUND', 404);
    });
    const results = [1, 2].map((lat) => batcher.getForecast(lat, 0));
    flush();
    expect(await Promise.all(results)).toEqual([at(1), at(2)]);
    expect(client.getForecast).toHaveBeenCalledTimes(2);
  });

  it('asks for each place on its own when the network fails, for the copies saved offline', async () => {
    const { client, batcher, flush } = setup(async () => {
      throw new ApiError('No connection.', 'NETWORK_ERROR', 0);
    });
    const results = [1, 2].map((lat) => batcher.getForecast(lat, 0));
    flush();
    expect(await Promise.all(results)).toEqual([at(1), at(2)]);
    expect(client.getForecast).toHaveBeenCalledTimes(2);
  });

  it('fails every place when the server fails the whole batch', async () => {
    const { client, batcher, flush } = setup(async () => {
      throw new ApiError('Provider down.', 'PROVIDER_ERROR', 502);
    });
    const results = [1, 2].map((lat) => batcher.getForecast(lat, 0));
    flush();
    for (const result of results) await expect(result).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    // Not repeated place by place: the provider is down for all of them.
    expect(client.getForecast).not.toHaveBeenCalled();
  });

  it('marks forecasts from a batch the service worker saved as saved too', async () => {
    const { batcher, flush } = setup(async (places) => {
      const response = { forecasts: places.map((p) => ({ forecast: at(p.latitude) })) };
      markSavedValue(response);
      return response;
    });
    const results = [1, 2].map((lat) => batcher.getForecast(lat, 0));
    flush();
    for (const forecast of await Promise.all(results)) expect(isSavedValue(forecast)).toBe(true);
  });

  it('sends a queued place alone when the city page asks for it', async () => {
    const { client, batcher, flush } = setup();
    const results = [1, 2, 3].map((lat) => batcher.getForecast(lat, 0));
    batcher.sendAlone(2, 0);
    flush();

    expect(await Promise.all(results)).toEqual([at(1), at(2), at(3)]);
    expect(client.getForecast).toHaveBeenCalledWith(2, 0);
    expect(client.getForecasts.mock.calls[0]![0].map((p: { latitude: number }) => p.latitude)).toEqual([1, 3]);
  });

  it('fails every place, instead of leaving them waiting, when the answer has another shape', async () => {
    const { batcher, flush } = setup(async () => ({ unexpected: true }) as unknown as ForecastsResponse);
    const results = [1, 2].map((lat) => batcher.getForecast(lat, 0));
    flush();
    for (const result of results) await expect(result).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});
