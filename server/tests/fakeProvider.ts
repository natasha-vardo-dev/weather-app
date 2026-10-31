import { vi } from 'vitest';
import type { AirQuality, Forecast, WeatherProvider } from '../src/providers/types.js';

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
    {
      time: '2026-10-15T12:00',
      temperature: 12.4,
      humidity: 71,
      windSpeed: 14.2,
      weatherCode: 3,
      precipitationProbability: 10,
      isDay: true,
    },
  ],
  yesterday: { date: '2026-10-14', weatherCode: 61, tempMax: 11, tempMin: 5, precipitationProbability: 90 },
  daily: [{ date: '2026-10-15', weatherCode: 3, tempMax: 14, tempMin: 6, precipitationProbability: 20 }],
};

export const sampleAirQuality: AirQuality = {
  time: '2026-10-15T12:00',
  timezone: 'Europe/Warsaw',
  europeanAqi: 54,
  usAqi: 68,
  pollutants: { pm2_5: 38.7, pm10: 60.9, ozone: 23, nitrogenDioxide: 31.1 },
};

export function createFakeProvider() {
  return {
    searchLocations: vi.fn(async () => [
      { id: 1, name: 'Warsaw', country: 'Poland', latitude: 52.23, longitude: 21.01 },
    ]),
    getForecast: vi.fn(async (_latitude: number, _longitude: number, _days: number) => sampleForecast),
    getAirQuality: vi.fn(async () => sampleAirQuality),
    getLocation: vi.fn(async (id: number, language: string) =>
      id === 756135
        ? {
            id,
            name: language === 'ru' ? 'Варшава' : 'Warsaw',
            country: language === 'ru' ? 'Польша' : 'Poland',
            latitude: 52.23,
            longitude: 21.01,
          }
        : null,
    ),
  } satisfies WeatherProvider;
}
