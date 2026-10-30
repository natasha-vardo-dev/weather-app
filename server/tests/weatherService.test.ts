import { describe, expect, it } from 'vitest';
import { WeatherService } from '../src/services/weatherService.js';
import { createFakeProvider } from './fakeProvider.js';

describe('WeatherService', () => {
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
