import { z } from 'zod';
import { ALERT_LEVELS, ALERT_TYPES, type AlertsResponse } from './alerts.js';
import { ERROR_CODES, type ApiErrorBody } from './errors.js';
import type { AlertTopicsResponse } from './push.js';
import type { AirQuality, Forecast, ForecastsResponse, Location, LocationsResponse, ReversePlace } from './types.js';

/**
 * The API's answers as schemas: the contract checked, not only typed. The server's tests parse
 * every answer with them (an endpoint can't send what the contract doesn't say), and the
 * OpenAPI description (docs/openapi.json) is generated from them, which CI compares with the
 * main branch's to catch a breaking change. Objects are strict: a field the server adds must be
 * added here first, so it reaches the description and its review.
 *
 * Server-side and tests only: the web client must not import these (zod would join its
 * bundle). The interfaces in types.ts stay the documented source; the checks at the end of
 * this file fail to compile when a schema and its interface drift apart.
 */

const placeKind = z.enum(['island']);

export const locationSchema = z
  .strictObject({
    id: z.int().positive(),
    name: z.string(),
    country: z.string(),
    region: z.string().optional(),
    areas: z.array(z.string()).optional(),
    kind: placeKind.optional(),
    latitude: z.number(),
    longitude: z.number(),
    timezone: z.string().optional(),
  })
  .meta({ id: 'Location' });

export const locationsResponseSchema = z
  .strictObject({ locations: z.array(locationSchema) })
  .meta({ id: 'LocationsResponse' });

const nullableNumber = z.number().nullable();

const currentWeatherSchema = z
  .strictObject({
    time: z.string(),
    temperature: z.number(),
    apparentTemperature: z.number(),
    humidity: z.number(),
    windSpeed: z.number(),
    windGusts: nullableNumber.optional(),
    windDirection: nullableNumber.optional(),
    weatherCode: z.int(),
    isDay: z.boolean(),
  })
  .meta({ id: 'CurrentWeather' });

const dailyForecastSchema = z
  .strictObject({
    date: z.string(),
    weatherCode: z.int(),
    tempMax: z.number(),
    tempMin: z.number(),
    precipitationProbability: nullableNumber,
    sunrise: z.string().nullable().optional(),
    sunset: z.string().nullable().optional(),
  })
  .meta({ id: 'DailyForecast' });

const hourlyForecastSchema = z
  .strictObject({
    time: z.string(),
    temperature: z.number(),
    humidity: z.number(),
    windSpeed: z.number(),
    windGusts: nullableNumber.optional(),
    weatherCode: z.int(),
    precipitationProbability: nullableNumber,
    precipitation: nullableNumber.optional(),
    uvIndex: nullableNumber.optional(),
    pressure: nullableNumber.optional(),
    visibility: nullableNumber.optional(),
    dewPoint: nullableNumber.optional(),
    isDay: z.boolean(),
  })
  .meta({ id: 'HourlyForecast' });

export const forecastSchema = z
  .strictObject({
    latitude: z.number(),
    longitude: z.number(),
    timezone: z.string(),
    units: z.strictObject({ temperature: z.string(), windSpeed: z.string(), precipitation: z.string().optional() }),
    current: currentWeatherSchema,
    yesterday: dailyForecastSchema.nullable(),
    hourly: z.array(hourlyForecastSchema),
    daily: z.array(dailyForecastSchema),
  })
  .meta({ id: 'Forecast' });

const errorCode = z.enum(Object.values(ERROR_CODES));
const errorDetail = z.strictObject({ code: errorCode, message: z.string() });

/** Every error answer, whatever the endpoint. */
export const apiErrorBodySchema = z.strictObject({ error: errorDetail }).meta({ id: 'ApiError' });

export const forecastsResponseSchema = z
  .strictObject({
    forecasts: z.array(z.union([z.strictObject({ forecast: forecastSchema }), z.strictObject({ error: errorDetail })])),
  })
  .meta({ id: 'ForecastsResponse' });

export const airQualitySchema = z
  .strictObject({
    time: z.string(),
    timezone: z.string(),
    europeanAqi: nullableNumber,
    usAqi: nullableNumber,
    pollutants: z.strictObject({
      pm2_5: nullableNumber,
      pm10: nullableNumber,
      ozone: nullableNumber,
      nitrogenDioxide: nullableNumber,
    }),
  })
  .meta({ id: 'AirQuality' });

export const reversePlaceSchema = z
  .strictObject({
    name: z.string(),
    country: z.string().optional(),
    latitude: z.number(),
    longitude: z.number(),
    id: z.int().positive().optional(),
  })
  .meta({ id: 'ReversePlace' });

const weatherAlertSchema = z
  .strictObject({
    id: z.string(),
    level: z.enum(ALERT_LEVELS),
    type: z.enum(ALERT_TYPES),
    onset: z.string(),
    expires: z.string(),
    language: z.string(),
    event: z.string(),
    headline: z.string().optional(),
    description: z.string().optional(),
    instruction: z.string().optional(),
    sender: z.string().optional(),
    web: z.string().optional(),
  })
  .meta({ id: 'WeatherAlert' });

export const alertsResponseSchema = z
  .strictObject({
    alerts: z.array(weatherAlertSchema),
    attribution: z.strictObject({ name: z.string(), url: z.string() }).nullable(),
    covered: z.boolean().optional(),
  })
  .meta({ id: 'AlertsResponse' });

export const alertTopicsResponseSchema = z
  .strictObject({ areas: z.array(z.string()) })
  .meta({ id: 'AlertTopicsResponse' });

// A schema and its interface must describe the same thing, both ways: a field in one only, or
// of another type, is a compile error here.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
function same<A, B>(check: Same<A, B>): void {
  void check;
}
same<z.infer<typeof locationSchema>, Location>(true);
same<z.infer<typeof locationsResponseSchema>, LocationsResponse>(true);
same<z.infer<typeof forecastSchema>, Forecast>(true);
same<z.infer<typeof forecastsResponseSchema>, ForecastsResponse>(true);
same<z.infer<typeof airQualitySchema>, AirQuality>(true);
same<z.infer<typeof reversePlaceSchema>, ReversePlace>(true);
same<z.infer<typeof alertsResponseSchema>, AlertsResponse>(true);
same<z.infer<typeof alertTopicsResponseSchema>, AlertTopicsResponse>(true);
same<z.infer<typeof apiErrorBodySchema>, ApiErrorBody>(true);
