/**
 * Writes the API's OpenAPI description (docs/openapi.json) from the zod schemas: request
 * parameters and bodies from schemas.ts, answers from responseSchemas.ts. Generated, never
 * edited by hand; CI checks it is up to date (--check) and compares it with the target
 * branch's to catch a breaking change (oasdiff, .github/workflows/ci.yml).
 *
 *   npm run openapi          write it
 *   npm run openapi:check    fail if it is out of date
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import { z } from 'zod';
import {
  airQualityQuerySchema,
  airQualitySchema,
  alertsQuerySchema,
  alertsResponseSchema,
  alertTopicsResponseSchema,
  alertTopicsSchema,
  API_PREFIX,
  apiErrorBodySchema,
  approximateQuerySchema,
  clientErrorSchema,
  forecastQuerySchema,
  forecastSchema,
  forecastsQuerySchema,
  forecastsResponseSchema,
  locationByIdSchema,
  locationSchema,
  locationsQuerySchema,
  locationsResponseSchema,
  reversePlaceSchema,
  reverseQuerySchema,
} from '@weather/shared';

const OUTPUT = new URL('../../docs/openapi.json', import.meta.url);
const TARGET = 'openapi-3.0';

type JsonSchema = Record<string, unknown>;

/** The answers' components, with references between them ("#/components/schemas/Forecast"). */
function components(): Record<string, JsonSchema> {
  const { schemas } = z.toJSONSchema(z.globalRegistry, {
    target: TARGET,
    uri: (id) => `#/components/schemas/${id}`,
  }) as { schemas: Record<string, JsonSchema> };
  for (const schema of Object.values(schemas)) delete schema.$id;
  return schemas;
}

const ref = (schema: z.ZodType) => {
  const id = z.globalRegistry.get(schema)?.id;
  if (!id) throw new Error('A response schema needs .meta({ id })');
  return { $ref: `#/components/schemas/${id}` };
};

/** Query (or path) parameters from an object schema, as a client sends them. */
function parameters(schema: z.ZodObject, path: string[] = []): JsonSchema[] {
  const json = z.toJSONSchema(schema, { target: TARGET, io: 'input', unrepresentable: 'any' }) as {
    properties: Record<string, JsonSchema>;
    required?: string[];
  };
  return Object.entries(json.properties).map(([name, { description, ...property }]) => ({
    name,
    in: path.includes(name) ? 'path' : 'query',
    // The `.describe()` text belongs to the parameter, where viewers show it, not to its type.
    ...(description ? { description } : {}),
    required: path.includes(name) || (json.required ?? []).includes(name),
    schema: property,
  }));
}

const body = (schema: z.ZodType) => ({
  required: true,
  content: { 'application/json': { schema: z.toJSONSchema(schema, { target: TARGET, io: 'input' }) } },
});

const json = (schema: z.ZodType, description: string) => ({
  description,
  content: { 'application/json': { schema: ref(schema) } },
});

/** An error answer: the one ApiError shape (its `code` says which of these it is). */
const error = (description: string, headers?: Record<string, JsonSchema>) => ({
  description,
  ...(headers ? { headers } : {}),
  content: { 'application/json': { schema: ref(apiErrorBodySchema) } },
});

const RETRY_AFTER = {
  'Retry-After': {
    description: 'Seconds until the address may try again.',
    schema: { type: 'integer', minimum: 1 },
  },
  RateLimit: {
    description: 'The allowance and what is left of it (IETF draft-8), when a request limit answered.',
    schema: { type: 'string' },
  },
};

/** The answers every endpoint may give besides its own: by HTTP status, with `default` for the rest. */
const commonErrors = {
  '400': error('A parameter or the body is missing or out of range (INVALID_REQUEST); the message names it.'),
  '429': error(
    'Too many requests from this address, or too many new places asked for (RATE_LIMITED). Wait for Retry-After.',
    RETRY_AFTER,
  ),
  '500': error('Our bug (INTERNAL).'),
  default: error('Any other error, in the same shape.'),
};
/** Endpoints that ask a provider for data can also be refused for its sake. */
const providerErrors = {
  '502': error('The data provider did not answer, or answered wrongly (PROVIDER_ERROR); try again in a minute.'),
  '503': error(
    "The server is near a provider's free limit for everyone (SERVICE_BUSY): cached answers still come, new places wait.",
  ),
};
const notFound = (what: string) => ({ '404': error(`${what} (NOT_FOUND).`) });

type Operation = Record<string, unknown>;

/**
 * A GET endpoint: its parameters from the query schema, the answer, and the errors it can give.
 * `tag` groups endpoints in viewers; `operationId` names them for generated clients.
 */
function get(
  operationId: string,
  tag: string,
  summary: string,
  description: string,
  query: z.ZodObject,
  answer: z.ZodType,
  options: { path?: string[]; errors?: Record<string, unknown>; answerDescription?: string } = {},
): { get: Operation } {
  return {
    get: {
      operationId,
      tags: [tag],
      summary,
      description,
      parameters: parameters(query, options.path ?? []),
      responses: {
        '200': json(answer, options.answerDescription ?? 'OK'),
        ...(options.errors ?? {}),
        ...commonErrors,
      },
    },
  };
}

const CACHED = 'Cached by the server (see docs/architecture.md, "Key parameters") and sent with Cache-Control.';

export function openApi() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Weather API',
      // The major version is the URL prefix; it changes only with a breaking change.
      version: API_PREFIX.replace(/^\/api\/v/, ''),
      description: [
        'The API between the weather app and its clients: a backend for frontend over Open-Meteo (forecast, air quality, place search), MeteoAlarm (official warnings), Nominatim (the place at coordinates) and ipwho.is (a city from the IP address).',
        'Every answer is JSON. Errors share one shape (ApiError) and are never cached. Temperatures are °C, wind km/h, times local to the place.',
        `Within ${API_PREFIX} only compatible changes are made (an optional field, a new endpoint, a new error code); a breaking change gets a new prefix. Requests are limited per IP address (429, with Retry-After); near a provider's free limit new data is refused for everyone (503) while cached answers still come.`,
        'Not described here, being operations rather than the contract: GET /api/health, /api/health/quota and /api/health/notify (uptime monitors), GET /api/internal/metrics and POST /api/internal/alerts/notify (a bearer secret each); see docs/operations.md.',
        'Generated from the zod schemas in @weather/shared (npm run openapi); do not edit by hand.',
      ].join('\n\n'),
      license: { name: 'MIT', url: 'https://github.com/natasha-vardo-dev/weather-app/blob/main/LICENSE' },
    },
    externalDocs: {
      description: 'How the API works and why',
      url: 'https://github.com/natasha-vardo-dev/weather-app/blob/main/docs/architecture.md',
    },
    servers: [
      { url: `https://weather-app-three-rho-21.vercel.app${API_PREFIX}`, description: 'The demo site' },
      { url: `http://localhost:3001${API_PREFIX}`, description: 'npm run dev' },
    ],
    tags: [
      { name: 'Places', description: 'Search and name places; GeoNames ids through Open-Meteo.' },
      { name: 'Weather', description: 'Forecasts and air quality from Open-Meteo.' },
      {
        name: 'Warnings',
        description: 'Official weather warnings from MeteoAlarm (Europe), and push notifications about them.',
      },
      { name: 'Client', description: 'What the web app reports about itself.' },
    ],
    paths: {
      '/locations': get(
        'searchLocations',
        'Places',
        'Search places by name',
        `Autocomplete for the search box. ${CACHED}`,
        locationsQuerySchema,
        locationsResponseSchema,
        { errors: providerErrors },
      ),
      '/locations/{id}': get(
        'getLocation',
        'Places',
        'A place by id, named in a language',
        `The name of a saved or linked place in the reader's language. ${CACHED}`,
        locationByIdSchema,
        locationSchema,
        { path: ['id'], errors: { ...notFound('No place with this id'), ...providerErrors } },
      ),
      '/forecast': get(
        'getForecast',
        'Weather',
        'The forecast at a place',
        `Current conditions, yesterday, the next 24 hours and the days ahead in one answer. ${CACHED} Past the cache's time a stale answer is sent at once with a short max-age while it refreshes; if the provider is down, the last good one for up to an hour.`,
        forecastQuerySchema,
        forecastSchema,
        { errors: providerErrors },
      ),
      '/forecasts': get(
        'getForecasts',
        'Weather',
        'Forecasts for several places',
        'The saved cities in one request, through the same cache as /forecast. A place that fails comes back as its own error while the others come as forecasts (200); when every place fails, the answer is the first error (429, 502 or 503).',
        forecastsQuerySchema,
        forecastsResponseSchema,
        { errors: providerErrors },
      ),
      '/air-quality': get(
        'getAirQuality',
        'Weather',
        'Current air quality at a place',
        `Both indexes and the main pollutants. ${CACHED}`,
        airQualityQuerySchema,
        airQualitySchema,
        { errors: providerErrors },
      ),
      '/places/reverse': get(
        'reversePlace',
        'Places',
        'The place at coordinates',
        'For "my location": the place at the position, matched to the nearest searchable city (within 25 km) so it gets an id. Nominatim allows one call a second for the whole server; when the queue is full the answer is 502 (PROVIDER_ERROR).',
        reverseQuerySchema,
        reversePlaceSchema,
        { errors: { ...notFound('No place at these coordinates'), ...providerErrors } },
      ),
      '/places/approximate': get(
        'approximatePlace',
        'Places',
        "The user's city from their IP address",
        'Offered when the browser cannot give a position. Depends on who asks (Cache-Control: private, no-store); the address is not logged or stored, only a keyed hash for a day.',
        approximateQuerySchema,
        reversePlaceSchema,
        { errors: { ...notFound('Could not tell the location from this address'), ...providerErrors } },
      ),
      '/alerts': get(
        'getAlerts',
        'Warnings',
        'Official weather warnings at a place',
        'Warnings in force at the place from the national weather service, in its own words; empty outside Europe (covered: false). Pages ask again every 4 minutes while open.',
        alertsQuerySchema,
        alertsResponseSchema,
        { errors: providerErrors },
      ),
      '/push/topics': {
        post: {
          operationId: 'setAlertTopics',
          tags: ['Warnings'],
          summary: "Subscribe or unsubscribe a device's push token to warnings for a place",
          description:
            'The server works out the MeteoAlarm areas the place belongs to and subscribes the token to their topics (one per area, kind of warning and minimum level) in Firebase Cloud Messaging; the token itself is not stored. Only with push configured on the server: otherwise the endpoint does not exist (404). Changes are limited per token (120 an hour) and by a global Firebase budget, which unsubscribing is exempt from; the per-IP request limit applies to both.',
          requestBody: body(alertTopicsSchema),
          responses: {
            '200': json(alertTopicsResponseSchema, 'Subscribed or unsubscribed'),
            ...notFound('Push notifications are not configured on this server'),
            '502': error('Firebase did not accept the change (PROVIDER_ERROR); the device may retry.'),
            '503': error('The Firebase budget for subscription changes is spent (SERVICE_BUSY); try later.'),
            ...commonErrors,
            '429': error(
              'Too many requests from this address, or more than 120 changes an hour for this token (RATE_LIMITED); the per-token limit does not apply to unsubscribing. Wait for Retry-After.',
              RETRY_AFTER,
            ),
          },
        },
      },
      '/client-errors': {
        post: {
          operationId: 'reportClientError',
          tags: ['Client'],
          summary: "An error from a user's browser, for the server log",
          description:
            'The web app sends render errors and uncaught errors here, a few per page at most; there is no error-tracking service. Logged as a warning, never answered with the details.',
          requestBody: body(clientErrorSchema),
          responses: { '204': { description: 'Logged' }, ...commonErrors },
        },
      },
    },
    components: { schemas: components() },
  };
}

// Referenced so the registry holds every answer before components() reads it.
void [locationSchema, forecastSchema, forecastsResponseSchema, airQualitySchema, reversePlaceSchema];

// Formatted as the repository's other files, so `prettier --check` agrees with it.
const options = await resolveConfig(OUTPUT);
const text = await format(JSON.stringify(openApi()), { ...options, parser: 'json', filepath: OUTPUT.pathname });
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUTPUT, 'utf8');
  } catch {
    // Missing: out of date as well.
  }
  if (current !== text) {
    console.error('docs/openapi.json is out of date with the schemas in @weather/shared: run `npm run openapi`.');
    process.exit(1);
  }
} else {
  writeFileSync(OUTPUT, text);
  console.log('Wrote docs/openapi.json');
}
