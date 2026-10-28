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

export const forecastQuerySchema = z.object({
  lat: z.coerce.number().min(LATITUDE_RANGE.min).max(LATITUDE_RANGE.max),
  lon: z.coerce.number().min(LONGITUDE_RANGE.min).max(LONGITUDE_RANGE.max),
  days: z.coerce.number().int().min(1).max(FORECAST_MAX_DAYS).default(FORECAST_DEFAULT_DAYS),
});

/** GET /api/places/reverse — the place at coordinates (current location), in `lang`. */
export const reverseQuerySchema = z.object({
  lat: z.coerce.number().min(LATITUDE_RANGE.min).max(LATITUDE_RANGE.max),
  lon: z.coerce.number().min(LONGITUDE_RANGE.min).max(LONGITUDE_RANGE.max),
  lang: languageSchema,
});

/** GET /api/places/approximate — the user's city from their IP, in `lang`. */
export const approximateQuerySchema = z.object({ lang: languageSchema });

export const airQualityQuerySchema = z.object({
  lat: z.coerce.number().min(LATITUDE_RANGE.min).max(LATITUDE_RANGE.max),
  lon: z.coerce.number().min(LONGITUDE_RANGE.min).max(LONGITUDE_RANGE.max),
});

/** GET /api/alerts — official warnings at a place, texts in `lang` where the issuer has it. */
export const alertsQuerySchema = z.object({
  lat: z.coerce.number().min(LATITUDE_RANGE.min).max(LATITUDE_RANGE.max),
  lon: z.coerce.number().min(LONGITUDE_RANGE.min).max(LONGITUDE_RANGE.max),
  lang: languageSchema,
});

/** Parsed (output) types, used by the server after validation. */
export type LocationsQuery = z.infer<typeof locationsQuerySchema>;
export type ForecastQuery = z.infer<typeof forecastQuerySchema>;
export type AirQualityQuery = z.infer<typeof airQualityQuerySchema>;
export type LocationByIdQuery = z.infer<typeof locationByIdSchema>;

/** Re-exported so the server checks errors against the same zod instance the schemas use. */
export { ZodError } from 'zod';
