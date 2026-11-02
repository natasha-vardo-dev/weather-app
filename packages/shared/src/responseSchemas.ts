import { z } from 'zod';
import { ALERT_LEVELS, ALERT_TYPES, type AlertsResponse } from './alerts.js';
import { ERROR_CODES, type ApiErrorBody, type ApiErrorCode } from './errors.js';
import type { AlertTopicsResponse } from './push.js';
import type { AirQuality, Forecast, ForecastsResponse, Location, LocationsResponse, ReversePlace } from './types.js';

/**
 * The API's answers as schemas: the contract checked, not only typed. The server's tests parse
 * every answer with them (an endpoint can't send what the contract doesn't say), and the
 * OpenAPI description (docs/openapi.json) is generated from them, which CI compares with the
 * main branch's to catch a breaking change. Objects are strict: a field the server adds must be
 * added here first, so it reaches the description and its review.
 *
 * The `.describe()` texts are what a reader of docs/openapi.json sees for each field: keep
 * them in step with the JSDoc of the interfaces in types.ts, which stay the documented source
 * for code. Units and formats belong here; reasons belong in the JSDoc.
 *
 * Server-side and tests only: the web client must not import these (zod would join its
 * bundle). The checks at the end of this file fail to compile when a schema and its interface
 * drift apart.
 */

const placeKind = z
  .enum(['island'])
  .describe('What the place is when it is not a town; clients ignore kinds they do not know.');

const LOCAL_TIME = 'Local time at the place, "YYYY-MM-DDTHH:mm" (no offset).';

export const locationSchema = z
  .strictObject({
    id: z.int().positive().describe('GeoNames id: identifies the place in city URLs and in GET /locations/{id}.'),
    name: z.string().describe('In the requested language where the provider has it, else in English.'),
    country: z.string().describe('Country name, in the requested language where available.'),
    region: z.string().optional().describe('First administrative level (state, voivodeship, region).'),
    areas: z
      .array(z.string())
      .optional()
      .describe(
        'Levels below the region, most general first (province, district, municipality); "" where a level is missing, so positions line up across places. Tells same-named places apart.',
      ),
    kind: placeKind.optional(),
    latitude: z.number().describe('Decimal degrees.'),
    longitude: z.number().describe('Decimal degrees.'),
    timezone: z.string().optional().describe('IANA time zone of the place, e.g. "Europe/Warsaw".'),
  })
  .meta({ id: 'Location', description: 'A place from the search geocoder.' });

export const locationsResponseSchema = z
  .strictObject({ locations: z.array(locationSchema).describe('Best matches first; empty when nothing matched.') })
  .meta({ id: 'LocationsResponse' });

const nullableNumber = z.number().nullable();

const currentWeatherSchema = z
  .strictObject({
    time: z.string().describe(`${LOCAL_TIME} The current hour.`),
    temperature: z.number().describe('Air temperature, °C (see Forecast.units).'),
    apparentTemperature: z.number().describe('Feels-like temperature, °C.'),
    humidity: z.number().describe('Relative humidity, %.'),
    windSpeed: z.number().describe('In Forecast.units.windSpeed (km/h).'),
    windGusts: nullableNumber
      .optional()
      .describe('Gust speed, in the same unit; absent in forecasts cached before the field existed.'),
    windDirection: nullableNumber.optional().describe('Direction the wind blows from, degrees (0 = north).'),
    weatherCode: z.int().describe('WMO weather interpretation code (0 clear sky … 99 thunderstorm with hail).'),
    isDay: z.boolean().describe('Whether it is daytime at the place now.'),
  })
  .meta({ id: 'CurrentWeather', description: 'The current hour at the place.' });

const dailyForecastSchema = z
  .strictObject({
    date: z.string().describe('"YYYY-MM-DD" in the place\'s time zone.'),
    weatherCode: z.int().describe('WMO weather interpretation code for the day.'),
    tempMax: z.number().describe('°C.'),
    tempMin: z.number().describe('°C.'),
    precipitationProbability: nullableNumber.describe(
      'Highest chance of precipitation in the day, %; null when unknown.',
    ),
    sunrise: z
      .string()
      .nullable()
      .optional()
      .describe(`${LOCAL_TIME} Null in polar day or night; absent in answers cached before the field existed.`),
    sunset: z
      .string()
      .nullable()
      .optional()
      .describe(`${LOCAL_TIME} Null in polar day or night; absent in older answers.`),
  })
  .meta({ id: 'DailyForecast' });

const hourlyForecastSchema = z
  .strictObject({
    time: z.string().describe(LOCAL_TIME),
    temperature: z.number().describe('°C.'),
    humidity: z.number().describe('Relative humidity, %.'),
    windSpeed: z.number().describe('In Forecast.units.windSpeed (km/h).'),
    windGusts: nullableNumber.optional().describe('Gust speed, in the same unit.'),
    weatherCode: z.int().describe('WMO weather interpretation code for the hour.'),
    precipitationProbability: nullableNumber.describe('Chance of precipitation, %; null when unknown.'),
    precipitation: nullableNumber
      .optional()
      .describe('Expected amount in the hour, in Forecast.units.precipitation (mm).'),
    uvIndex: nullableNumber.optional().describe('UV index (WHO scale, 0–11+).'),
    pressure: nullableNumber.optional().describe('Sea-level pressure, hPa.'),
    visibility: nullableNumber.optional().describe('Metres.'),
    dewPoint: nullableNumber.optional().describe('Dew point, °C.'),
    isDay: z.boolean().describe('Whether the hour is in daylight.'),
  })
  .meta({ id: 'HourlyForecast' });

export const forecastSchema = z
  .strictObject({
    latitude: z.number().describe('The point the forecast is for: the request rounded to 2 decimals (~1 km).'),
    longitude: z.number().describe('The point the forecast is for: the request rounded to 2 decimals (~1 km).'),
    timezone: z.string().describe('IANA time zone of the place; every time in the answer is local to it.'),
    units: z
      .strictObject({
        temperature: z.string().describe('Always "°C": clients convert.'),
        windSpeed: z.string().describe('"km/h".'),
        precipitation: z.string().optional().describe('"mm".'),
      })
      .describe('Units of the numbers in this answer, as the provider names them.'),
    // No .describe() on a plain reference: it would wrap the $ref in allOf, which oasdiff
    // reads as the required properties removed (a breaking change).
    current: currentWeatherSchema,
    yesterday: dailyForecastSchema
      .nullable()
      .describe("Yesterday's weather at the place, for comparison; null when the provider has none."),
    hourly: z.array(hourlyForecastSchema).describe('The next 24 hours, starting with the current hour.'),
    daily: z.array(dailyForecastSchema).describe("One per day, starting with today in the place's time zone."),
  })
  .meta({ id: 'Forecast' });

// The codes the API can send. SERVER_UNAVAILABLE is the client's own (a proxy's 5xx with no API
// body) and never in an answer, so it is not part of the contract: listed, it was a new enum value
// in every response, which oasdiff counts as breaking. NETWORK_ERROR, client-side too, stays: the
// published description already has it, and removing it would be a change as well.
const errorCode = z
  .enum(Object.values(ERROR_CODES).filter((code): code is ApiErrorCode => code !== ERROR_CODES.SERVER_UNAVAILABLE))
  .describe(
    [
      'What went wrong, for the client to act on:',
      'INVALID_REQUEST (400): a parameter or body is missing or out of range; the message names it.',
      'NOT_FOUND (404): no such place, or no such endpoint.',
      'RATE_LIMITED (429): this address sent too many requests, or asked for too many new places; Retry-After says when to try again.',
      'PROVIDER_ERROR (502): the data provider did not answer or answered wrongly; worth a retry in a minute.',
      "SERVICE_BUSY (503): the server is near a provider's free limit for everyone; cached data is still served, new places wait.",
      'INTERNAL (500): our bug.',
      'NETWORK_ERROR: made by the client only when no answer came; never sent by the API.',
    ].join(' '),
  );
const errorDetail = z
  .strictObject({
    code: errorCode,
    message: z.string().describe('Plain English, safe to show to the user; clients translate by code where they can.'),
  })
  .describe('What went wrong: a code to act on and a message to show.');
// The same shape without descriptions, for the batch answer below: oasdiff matches the branches
// of an anyOf by content, so a description added inside one counts as a new (breaking) branch.
const errorDetailPlain = z.strictObject({ code: z.enum(errorCode.options), message: z.string() });

/** Every error answer, whatever the endpoint. */
export const apiErrorBodySchema = z
  .strictObject({ error: errorDetail })
  .meta({ id: 'ApiError', description: 'The one shape of every error answer; errors are never cached.' });

export const forecastsResponseSchema = z
  .strictObject({
    forecasts: z
      .array(z.union([z.strictObject({ forecast: forecastSchema }), z.strictObject({ error: errorDetailPlain })]))
      .describe(
        'In the order the places were asked for: the forecast, or the error for that place alone (the others still come).',
      ),
  })
  .meta({ id: 'ForecastsResponse' });

export const airQualitySchema = z
  .strictObject({
    time: z.string().describe(`${LOCAL_TIME} The hour the values are for.`),
    timezone: z.string().describe('IANA time zone of the place, used to pick the index people there know.'),
    europeanAqi: nullableNumber.describe(
      'European Air Quality Index (0–20 good … over 100 extremely poor); null where the provider has no data.',
    ),
    usAqi: nullableNumber.describe('US AQI (0–50 good … over 300 hazardous); null where the provider has no data.'),
    pollutants: z
      .strictObject({
        pm2_5: nullableNumber.describe('Particulate matter under 2.5 µm.'),
        pm10: nullableNumber.describe('Particulate matter under 10 µm.'),
        ozone: nullableNumber.describe('O₃.'),
        nitrogenDioxide: nullableNumber.describe('NO₂.'),
      })
      .describe('Concentrations, µg/m³.'),
  })
  .meta({ id: 'AirQuality', description: 'Current air quality at a place.' });

export const reversePlaceSchema = z
  .strictObject({
    name: z.string().describe('City or locality, in the requested language where available.'),
    country: z.string().optional().describe('Country name.'),
    latitude: z
      .number()
      .describe(
        "The matched city's coordinates when id is set, so it is the same place as in search; else the point asked for.",
      ),
    longitude: z.number().describe('See latitude.'),
    id: z.int().positive().optional().describe('GeoNames id, when the place matched a city the search knows.'),
  })
  .meta({ id: 'ReversePlace', description: 'What to call a place found by coordinates or by IP address.' });

const weatherAlertSchema = z
  .strictObject({
    id: z.string().describe("The warning's CAP identifier; stable for one warning."),
    level: z
      .enum(ALERT_LEVELS)
      .describe('MeteoAlarm awareness level: yellow (2), orange (3) or red (4); green is never sent.'),
    type: z.enum(ALERT_TYPES).describe('MeteoAlarm awareness type (CAP profile v2.0); "other" for anything new.'),
    onset: z.string().describe('ISO 8601 with offset; the warning is in force from onset to expires.'),
    expires: z.string().describe('ISO 8601 with offset.'),
    language: z
      .string()
      .describe('Language of the texts (BCP 47, e.g. "pl-PL"): the requested one if the issuer has it, else English.'),
    event: z.string().describe("The issuer's own name for the event, unmodified."),
    headline: z.string().optional().describe("The issuer's headline, unmodified."),
    description: z.string().optional().describe("The issuer's description, unmodified."),
    instruction: z.string().optional().describe("The issuer's advice, unmodified."),
    sender: z.string().optional().describe('The national weather service that issued it.'),
    web: z.string().optional().describe("URL of the issuer's page about this kind of warning."),
  })
  .meta({ id: 'WeatherAlert', description: 'One official warning, in the words of the national weather service.' });

export const alertsResponseSchema = z
  .strictObject({
    alerts: z
      .array(weatherAlertSchema)
      .describe('Most severe first, then soonest; empty where there are none or no coverage.'),
    attribution: z
      .strictObject({
        name: z.string().describe('The credit line to show, e.g. "EUMETNET – MeteoAlarm".'),
        url: z.string().describe('Where the credit links to.'),
      })
      .nullable()
      .describe("Who to credit next to the warnings, as the source's terms require; null when nothing is shown."),
    covered: z
      .boolean()
      .optional()
      .describe(
        'Whether the source covers the place at all (false outside Europe), so warnings and notifications can exist there. Absent in answers cached before the field existed.',
      ),
  })
  .meta({ id: 'AlertsResponse' });

export const alertTopicsResponseSchema = z
  .strictObject({
    areas: z
      .array(z.string())
      .describe('The MeteoAlarm areas the place belongs to; the service worker matches incoming warnings by them.'),
  })
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
