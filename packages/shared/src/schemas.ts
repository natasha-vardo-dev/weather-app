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
  .default('en');

export const locationsQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(SEARCH_MIN_LENGTH, `Type at least ${SEARCH_MIN_LENGTH} characters to search.`)
    .max(SEARCH_MAX_LENGTH),
  limit: z.coerce.number().int().min(1).max(SEARCH_MAX_LIMIT).default(SEARCH_DEFAULT_LIMIT),
  lang: languageSchema,
});

/** GET /api/locations/:id — one place by provider id, names in `lang`. */
export const locationByIdSchema = z.object({
  // Bounded, so an impossible id is answered with 400 here, not sent to the provider.
  id: z.coerce.number().int().positive().max(MAX_LOCATION_ID),
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
function coordinate<In = unknown>(range: { min: number; max: number }) {
  return z.preprocess(
    (value: In) => (typeof value === 'string' ? (value.trim() === '' ? undefined : Number(value)) : value),
    z
      .number({
        error: (issue) =>
          issue.code === 'invalid_type' ? (issue.input === undefined ? 'Required.' : 'Must be a number.') : undefined,
      })
      .min(range.min)
      .max(range.max),
  );
}

export const forecastQuerySchema = z.object({
  lat: coordinate(LATITUDE_RANGE),
  lon: coordinate(LONGITUDE_RANGE),
  days: z.coerce.number().int().min(1).max(FORECAST_MAX_DAYS).default(FORECAST_DEFAULT_DAYS),
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
            lat: coordinate<string>(LATITUDE_RANGE),
            lon: coordinate<string>(LONGITUDE_RANGE),
          }),
        )
        .min(1)
        .max(MAX_FAVORITES, `At most ${MAX_FAVORITES} places at once.`),
    ),
  days: z.coerce.number().int().min(1).max(FORECAST_MAX_DAYS).default(FORECAST_DEFAULT_DAYS),
});

/** GET /api/places/reverse — the place at coordinates (current location), in `lang`. */
export const reverseQuerySchema = z.object({
  lat: coordinate(LATITUDE_RANGE),
  lon: coordinate(LONGITUDE_RANGE),
  lang: languageSchema,
});

/** GET /api/places/approximate — the user's city from their IP, in `lang`. */
export const approximateQuerySchema = z.object({ lang: languageSchema });

export const airQualityQuerySchema = z.object({
  lat: coordinate(LATITUDE_RANGE),
  lon: coordinate(LONGITUDE_RANGE),
});

/** GET /api/alerts — official warnings at a place, texts in `lang` where the issuer has it. */
export const alertsQuerySchema = z.object({
  lat: coordinate(LATITUDE_RANGE),
  lon: coordinate(LONGITUDE_RANGE),
  lang: languageSchema,
});

/** POST /api/push/topics — a device's push token and the place it wants warnings for. */
export const alertTopicsSchema = z.object({
  // FCM web tokens are ~160 characters; the bound keeps junk away from the push service.
  token: z.string().min(20).max(4096),
  latitude: z.number().min(LATITUDE_RANGE.min).max(LATITUDE_RANGE.max),
  longitude: z.number().min(LONGITUDE_RANGE.min).max(LONGITUDE_RANGE.max),
  group: z.enum(ALERT_GROUPS),
  level: z.enum(ALERT_LEVELS),
  subscribe: z.boolean(),
});

/** What happened in the browser: a render that failed, or an error nothing caught. */
export const CLIENT_ERROR_KINDS = ['render', 'error', 'rejection'] as const;

/**
 * POST /api/client-errors — an error from a user's browser, for the server log (there is no
 * error-tracking service). Bounded: anyone can send it, and it ends up in the logs.
 */
export const clientErrorSchema = z.object({
  kind: z.enum(CLIENT_ERROR_KINDS),
  message: z.string().max(500),
  stack: z.string().max(4000).optional(),
  /** Which components a render error happened in (React gives it). */
  componentStack: z.string().max(2000).optional(),
  /** The page, with places replaced by a placeholder: no coordinates in the logs. */
  path: z.string().max(200),
  /** The build that failed: the service worker may keep an old one in use for a while. */
  release: z.string().max(40).optional(),
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
