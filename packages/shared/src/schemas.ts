import { z } from 'zod';
import {
  FORECAST_DEFAULT_DAYS,
  FORECAST_MAX_DAYS,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LENGTH,
  SEARCH_MAX_LIMIT,
  SEARCH_MIN_LENGTH,
} from './constants.js';
import { LATITUDE_RANGE, LONGITUDE_RANGE, MAX_LOCATION_ID } from './coordinates.js';
import { ALERT_LEVELS } from './alerts.js';
import { MAX_FAVORITES } from './favorites.js';
import { ALERT_GROUPS } from './push.js';

/** ISO 639-1 code for place names. The provider falls back to English for unknown ones. */
const languageSchema = z
  .string()
  .regex(/^[a-z]{2}$/i)
  .transform((value) => value.toLowerCase())
  .default('en')
  .describe('ISO 639-1 code for place names (en, de, fr, es, it, pl, uk, ru, …); English for unknown ones.');

export const locationsQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(SEARCH_MIN_LENGTH, `Type at least ${SEARCH_MIN_LENGTH} characters to search.`)
    .max(SEARCH_MAX_LENGTH)
    .describe('A place name, in any language or script; old and other names match too ("Kiev" finds Kyiv).'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SEARCH_MAX_LIMIT)
    .default(SEARCH_DEFAULT_LIMIT)
    .describe('How many places at most.'),
  lang: languageSchema,
});

/** GET /api/locations/:id — one place by provider id, names in `lang`. */
export const locationByIdSchema = z.object({
  // Bounded, so an impossible id is answered with 400 here, not sent to the provider.
  id: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_LOCATION_ID)
    .describe('GeoNames id of the place, as in search results and city URLs (/weather/756135-warsaw).'),
  lang: languageSchema,
});

/**
 * A latitude or longitude from a query string. `z.coerce.number()` alone reads an empty or blank
 * value as 0 (`Number('') === 0`), so `?lat=&lon=` would be a valid place in the Gulf of Guinea:
 * a provider call and a cache entry for a request that named no place. Blank is missing here.
 * A preprocess, not a pipe from a string: the OpenAPI description keeps the parameter a number.
 * It converts the string itself, so a missing value and a wrong one get messages of their own
 * ("Required." rather than "expected number, received NaN"); range errors keep Zod's.
 * `In` is the input type, `string` inside a pipe from a split string (which accepts nothing wider).
 */
function coordinate<In = unknown>(range: { min: number; max: number }, description: string) {
  return z.preprocess(
    (value: In) => (typeof value === 'string' ? (value.trim() === '' ? undefined : Number(value)) : value),
    z
      .number({
        error: (issue) =>
          issue.code === 'invalid_type' ? (issue.input === undefined ? 'Required.' : 'Must be a number.') : undefined,
      })
      .min(range.min)
      .max(range.max)
      .describe(description),
  );
}

const LAT = 'Latitude in decimal degrees (-90 to 90); the server rounds to 2 decimals (~1 km).';
const LON = 'Longitude in decimal degrees (-180 to 180); the server rounds to 2 decimals (~1 km).';
// Warnings are matched against region borders at the exact point, not the rounded one.
const LAT_EXACT = 'Latitude in decimal degrees (-90 to 90).';
const LON_EXACT = 'Longitude in decimal degrees (-180 to 180).';
const daysSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(FORECAST_MAX_DAYS)
  .default(FORECAST_DEFAULT_DAYS)
  .describe(`Days of daily forecast, today included (1 to ${FORECAST_MAX_DAYS}; accuracy drops after 10).`);

export const forecastQuerySchema = z.object({
  lat: coordinate(LATITUDE_RANGE, LAT),
  lon: coordinate(LONGITUDE_RANGE, LON),
  days: daysSchema,
});

/**
 * GET /api/forecasts?places=52.23,21.01;50.06,19.94 — several places at once, for the saved
 * cities: up to MAX_FAVORITES, the most a page asks for.
 */
export const forecastsQuerySchema = z.object({
  places: z
    .string()
    .transform((value) =>
      value.split(';').map((pair) => {
        const [lat, lon] = pair.split(',');
        return { lat, lon };
      }),
    )
    .pipe(
      z
        .array(
          z.object({
            // A missing half (`52.23` with no comma) or an empty one (`places=,`) is refused too.
            lat: coordinate<string>(LATITUDE_RANGE, LAT),
            lon: coordinate<string>(LONGITUDE_RANGE, LON),
          }),
        )
        .min(1)
        .max(MAX_FAVORITES, `At most ${MAX_FAVORITES} places at once.`),
    )
    .describe(
      `Up to ${MAX_FAVORITES} places as "lat,lon" pairs separated by semicolons, e.g. "52.23,21.01;50.06,19.94". Answered in the same order.`,
    ),
  days: daysSchema,
});

/** GET /api/places/reverse — the place at coordinates (current location), in `lang`. */
export const reverseQuerySchema = z.object({
  lat: coordinate(LATITUDE_RANGE, LAT),
  lon: coordinate(LONGITUDE_RANGE, LON),
  lang: languageSchema,
});

/** GET /api/places/approximate — the user's city from their IP, in `lang`. */
export const approximateQuerySchema = z.object({ lang: languageSchema });

export const airQualityQuerySchema = z.object({
  lat: coordinate(LATITUDE_RANGE, LAT),
  lon: coordinate(LONGITUDE_RANGE, LON),
});

/** GET /api/alerts — official warnings at a place, texts in `lang` where the issuer has it. */
export const alertsQuerySchema = z.object({
  lat: coordinate(LATITUDE_RANGE, LAT_EXACT),
  lon: coordinate(LONGITUDE_RANGE, LON_EXACT),
  lang: languageSchema.describe("ISO 639-1 code: the issuer's texts in this language where it has them, else English."),
});

/** POST /api/push/topics — a device's push token and the place it wants warnings for. */
export const alertTopicsSchema = z.object({
  // FCM web tokens are ~160 characters; the bound keeps junk away from the push service.
  token: z.string().min(20).max(4096).describe("The device's Firebase Cloud Messaging registration token."),
  latitude: z
    .number()
    .min(LATITUDE_RANGE.min)
    .max(LATITUDE_RANGE.max)
    .describe('Of the place to watch, decimal degrees.'),
  longitude: z
    .number()
    .min(LONGITUDE_RANGE.min)
    .max(LONGITUDE_RANGE.max)
    .describe('Of the place to watch, decimal degrees.'),
  group: z.enum(ALERT_GROUPS).describe('Which warnings: "storm" (wind and thunderstorms) or "all" types.'),
  level: z.enum(ALERT_LEVELS).describe('Notify from this level up.'),
  subscribe: z.boolean().describe('true to subscribe the token to the place, false to unsubscribe it.'),
});

/** What happened in the browser: a render that failed, or an error nothing caught. */
export const CLIENT_ERROR_KINDS = ['render', 'error', 'rejection'] as const;

/**
 * POST /api/client-errors — an error from a user's browser, for the server log (there is no
 * error-tracking service). Bounded: anyone can send it, and it ends up in the logs.
 */
export const clientErrorSchema = z.object({
  kind: z
    .enum(CLIENT_ERROR_KINDS)
    .describe(
      '"render": a component failed to render; "error": an uncaught error; "rejection": an unhandled promise rejection.',
    ),
  message: z.string().max(500).describe("The error's message."),
  stack: z.string().max(4000).optional().describe('The stack trace, when there is one.'),
  componentStack: z
    .string()
    .max(2000)
    .optional()
    .describe('Which components a render error happened in (React gives it).'),
  path: z.string().max(200).describe('The page, with places replaced by a placeholder: no coordinates reach the logs.'),
  release: z
    .string()
    .max(40)
    .optional()
    .describe('The build that failed: the service worker may keep an old one in use for a while.'),
});

/** Parsed (output) types, used by the server after validation. */
export type LocationsQuery = z.infer<typeof locationsQuerySchema>;
export type ForecastQuery = z.infer<typeof forecastQuerySchema>;
export type AirQualityQuery = z.infer<typeof airQualityQuerySchema>;
export type LocationByIdQuery = z.infer<typeof locationByIdSchema>;

/** Re-exported so the server checks errors against the same zod instance the schemas use. */
export { ZodError } from 'zod';
/** For the server's checks of provider answers against these schemas; a type, so nothing joins a bundle. */
export type { ZodType } from 'zod';
