import { afterEach, describe, expect, it, vi } from 'vitest';
import { WeatherService } from '../src/services/weatherService.js';
import { createFakeProvider } from './fakeProvider.js';

describe('WeatherService', () => {
  afterEach(() => vi.useRealTimers());

  it('answers with the last forecast while the provider is down, for up to an hour', async () => {
    vi.useFakeTimers();
    const provider = createFakeProvider();
    const service = new WeatherService(provider);
    const { value: first } = await service.getForecast(52.23, 21.01);

    provider.getForecast.mockRejectedValue(new Error('provider down'));
    vi.advanceTimersByTime(30 * 60 * 1000);
    await expect(service.getForecast(52.23, 21.01)).resolves.toEqual({ value: first, stale: true });

    vi.advanceTimersByTime(31 * 60 * 1000);
    await expect(service.getForecast(52.23, 21.01)).rejects.toThrow('provider down');
  });

  it('waits for a new forecast once the old one is more than 5 minutes past its TTL', async () => {
    vi.useFakeTimers();
    const provider = createFakeProvider();
    const service = new WeatherService(provider);
    await service.getForecast(52.23, 21.01);

    vi.advanceTimersByTime(20 * 60 * 1000);
    await expect(service.getForecast(52.23, 21.01)).resolves.toMatchObject({ stale: false });
    expect(provider.getForecast).toHaveBeenCalledTimes(2);
  });

  it('asks the provider for the rounded point, the one the cache key stands for', async () => {
    const provider = createFakeProvider();
    const service = new WeatherService(provider);
    await service.getForecast(52.2297, 21.0122);
    await service.getAirQuality(52.2297, 21.0122);
    expect(provider.getForecast).toHaveBeenCalledWith(52.23, 21.01, expect.any(Number));
    expect(provider.getAirQuality).toHaveBeenCalledWith(52.23, 21.01);
  });

  it('serves any number of days from at most two forecasts a place, cut to the days asked for', async () => {
    const provider = createFakeProvider();
    const days = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        date: `2026-10-${10 + i}`,
        weatherCode: 3,
        tempMax: 14,
        tempMin: 6,
        precipitationProbability: 20,
      }));
    provider.getForecast.mockImplementation(async (_lat, _lon, n) => ({
      ...(await createFakeProvider().getForecast(0, 0, n)),
      daily: days(n),
    }));
    const service = new WeatherService(provider);

    for (const n of [1, 3, 7, 10]) {
      expect((await service.getForecast(52.23, 21.01, n)).value.daily).toHaveLength(n);
    }
    for (const n of [11, 16]) {
      expect((await service.getForecast(52.23, 21.01, n)).value.daily).toHaveLength(n);
    }
    expect(provider.getForecast.mock.calls.map(([, , n]) => n)).toEqual([10, 16]);
  });

  it('caches forecasts for nearby coordinates', async () => {
    const provider = createFakeProvider();
    const service = new WeatherService(provider);

    await service.getForecast(52.2297, 21.0122);
    await service.getForecast(52.2301, 21.0118);

    expect(provider.getForecast).toHaveBeenCalledTimes(1);
  });

  it('asks the provider once when many people open one city at the same time', async () => {
    const provider = createFakeProvider();
    const service = new WeatherService(provider);

    await Promise.all(Array.from({ length: 10 }, () => service.getForecast(52.2297, 21.0122)));

    expect(provider.getForecast).toHaveBeenCalledTimes(1);
    expect(service.cacheStats().forecast).toMatchObject({ misses: 1, coalesced: 9 });
  });

  it('caches air quality for nearby coordinates', async () => {
    const provider = createFakeProvider();
    const service = new WeatherService(provider);

    await service.getAirQuality(52.2297, 21.0122);
    await service.getAirQuality(52.2301, 21.0118);

    expect(provider.getAirQuality).toHaveBeenCalledTimes(1);
  });

  it('caches places by id per language, including unknown ids', async () => {
    const provider = createFakeProvider();
    const service = new WeatherService(provider);

    await service.getLocation(756135, 'ru');
    await service.getLocation(756135, 'ru');
    await service.getLocation(756135, 'en');
    expect(await service.getLocation(1, 'en')).toBeNull();
    expect(await service.getLocation(1, 'en')).toBeNull();

    expect(provider.getLocation).toHaveBeenCalledTimes(3);
  });

  it('treats location queries case-insensitively for caching', async () => {
    const provider = createFakeProvider();
    const service = new WeatherService(provider);

    await service.searchLocations('Warsaw');
    await service.searchLocations('  warsaw ');

    expect(provider.searchLocations).toHaveBeenCalledTimes(1);
  });

  it('keeps separate cache entries per language', async () => {
    const provider = createFakeProvider();
    const service = new WeatherService(provider);

    await service.searchLocations('Warsaw', 5, 'en');
    await service.searchLocations('Warsaw', 5, 'pl');
    await service.searchLocations('Warsaw', 5, 'pl');

    expect(provider.searchLocations).toHaveBeenCalledTimes(2);
    expect(provider.searchLocations).toHaveBeenLastCalledWith('Warsaw', 5, 'pl');
  });
});
