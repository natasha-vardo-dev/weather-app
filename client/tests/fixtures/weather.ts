import type { AirQuality, AlertsResponse, Forecast, Location } from '@weather/shared';

/**
 * API answers for component and end-to-end tests. The forecast is built around the current
 * time at the place, so "Now", "Today" and the comparison with yesterday are real, whatever
 * day the tests run.
 */

export const TIME_ZONE = 'Europe/Warsaw';

export const warsaw: Location = {
  id: 756135,
  name: 'Warsaw',
  country: 'Poland',
  region: 'Masovian Voivodeship',
  areas: ['Warszawa', ''],
  latitude: 52.22977,
  longitude: 21.01178,
  timezone: TIME_ZONE,
};

export const warsawSuburb: Location = {
  id: 3096472,
  name: 'Warsaw',
  country: 'United States',
  region: 'Indiana',
  latitude: 41.2381,
  longitude: -85.85305,
  timezone: 'America/Indiana/Indianapolis',
};

export const krakow: Location = {
  id: 3094802,
  name: 'Kraków',
  country: 'Poland',
  region: 'Lesser Poland',
  latitude: 50.06143,
  longitude: 19.93658,
  timezone: TIME_ZONE,
};

/** "YYYY-MM-DDTHH:mm" at the place, as the API sends local times. */
function localTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return parts.replace(' ', 'T');
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function forecast(
  place: { latitude: number; longitude: number },
  { now = new Date(), temperature = 12.4 }: { now?: Date; temperature?: number } = {},
): Forecast {
  const hourStart = new Date(Math.floor(now.getTime() / HOUR) * HOUR);
  const today = localTime(now).slice(0, 10);
  const day = (offset: number) => localTime(new Date(now.getTime() + offset * DAY)).slice(0, 10);
  return {
    latitude: Math.round(place.latitude * 100) / 100,
    longitude: Math.round(place.longitude * 100) / 100,
    timezone: TIME_ZONE,
    units: { temperature: '°C', windSpeed: 'km/h', precipitation: 'mm' },
    current: {
      time: localTime(hourStart),
      temperature,
      apparentTemperature: temperature - 2.3,
      humidity: 71,
      windSpeed: 14.2,
      windGusts: 30,
      windDirection: 250,
      weatherCode: 3,
      isDay: true,
    },
    yesterday: { date: day(-1), weatherCode: 61, tempMax: 11, tempMin: 5, precipitationProbability: 90 },
    hourly: Array.from({ length: 24 }, (_, i) => ({
      time: localTime(new Date(hourStart.getTime() + i * HOUR)),
      temperature: temperature + Math.sin(i / 4) * 3,
      humidity: 70,
      windSpeed: 12,
      windGusts: 25,
      weatherCode: i % 6 === 0 ? 61 : 2,
      precipitationProbability: i % 6 === 0 ? 60 : 10,
      precipitation: i % 6 === 0 ? 0.4 : 0,
      uvIndex: 2,
      pressure: 1012,
      visibility: 20000,
      dewPoint: 6,
      isDay: true,
    })),
    daily: Array.from({ length: 10 }, (_, i) => ({
      date: i === 0 ? today : day(i),
      weatherCode: [3, 61, 2, 0, 95, 71, 45, 1, 3, 80][i]!,
      tempMax: 14 + (i % 3),
      tempMin: 6 + (i % 2),
      precipitationProbability: [20, 80, 10, 0, 70, 40, 5, 0, 15, 55][i]!,
      sunrise: `${i === 0 ? today : day(i)}T06:45`,
      sunset: `${i === 0 ? today : day(i)}T16:30`,
    })),
  };
}

export function airQuality(now = new Date()): AirQuality {
  return {
    time: localTime(now).slice(0, 13) + ':00',
    timezone: TIME_ZONE,
    europeanAqi: 34,
    usAqi: 48,
    pollutants: { pm2_5: 8.1, pm10: 14.2, ozone: 61, nitrogenDioxide: 12.4 },
  };
}

export const noAlerts: AlertsResponse = {
  alerts: [],
  attribution: { name: 'EUMETNET – MeteoAlarm', url: 'https://meteoalarm.org' },
  covered: true,
};
