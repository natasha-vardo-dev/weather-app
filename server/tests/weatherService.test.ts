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

  it('caches air quality for nearby coordinates', async () => {
    const provider = createFakeProvider();
    const service = new WeatherService(provider);

    await service.getAirQuality(52.2297, 21.0122);
    await service.getAirQuality(52.2301, 21.0118);

    expect(provider.getAirQuality).toHaveBeenCalledTimes(1);
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
