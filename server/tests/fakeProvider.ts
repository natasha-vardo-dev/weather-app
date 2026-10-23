import { vi } from 'vitest';
import type { Forecast, WeatherProvider } from '../src/providers/types.js';

export const sampleForecast: Forecast = {
  latitude: 52.23,
  longitude: 21.01,
  timezone: 'Europe/Warsaw',
  units: { temperature: '°C', windSpeed: 'km/h' },
  current: {
    time: '2026-10-15T12:00',
    temperature: 12.4,
    apparentTemperature: 10.1,
    humidity: 71,
    windSpeed: 14.2,
    weatherCode: 3,
    isDay: true,
  },
  hourly: [
    { time: '2026-10-15T12:00', temperature: 12.4, weatherCode: 3, precipitationProbability: 10, isDay: true },
  ],
  yesterday: { date: '2026-10-14', weatherCode: 61, tempMax: 11, tempMin: 5, precipitationProbability: 90 },
  daily: [
    { date: '2026-10-15', weatherCode: 3, tempMax: 14, tempMin: 6, precipitationProbability: 20 },
  ],
};

export function createFakeProvider() {
  return {
    searchLocations: vi.fn(async () => [
      { id: 1, name: 'Warsaw', country: 'Poland', latitude: 52.23, longitude: 21.01 },
    ]),
    getForecast: vi.fn(async () => sampleForecast),
  } satisfies WeatherProvider;
}
