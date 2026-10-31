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
  return Object.entries(json.properties).map(([name, property]) => ({
    name,
    in: path.includes(name) ? 'path' : 'query',
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

const error = { description: 'Error', content: { 'application/json': { schema: ref(apiErrorBodySchema) } } };

function get(summary: string, query: z.ZodObject, answer: z.ZodType, path: string[] = []) {
  return {
    get: {
      summary,
      parameters: parameters(query, path),
      responses: { '200': json(answer, 'OK'), default: error },
    },
  };
}

export function openApi() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Weather API',
      // The major version is the URL prefix; it changes only with a breaking change.
      version: API_PREFIX.replace(/^\/api\/v/, ''),
      description:
        'The API between the weather app and its clients. Errors share one shape (ApiError). Generated from the zod schemas in @weather/shared; do not edit by hand.',
    },
    servers: [{ url: API_PREFIX }],
    paths: {
      '/locations': get('Search places by name', locationsQuerySchema, locationsResponseSchema),
      '/locations/{id}': get('A place by id, named in a language', locationByIdSchema, locationSchema, ['id']),
      '/forecast': get('The forecast at a place', forecastQuerySchema, forecastSchema),
      '/forecasts': get('Forecasts for several places', forecastsQuerySchema, forecastsResponseSchema),
      '/air-quality': get('Current air quality at a place', airQualityQuerySchema, airQualitySchema),
      '/places/reverse': get('The place at coordinates', reverseQuerySchema, reversePlaceSchema),
      '/places/approximate': get("The user's city from their IP address", approximateQuerySchema, reversePlaceSchema),
      '/alerts': get('Official weather warnings at a place', alertsQuerySchema, alertsResponseSchema),
      '/push/topics': {
        post: {
          summary: "Subscribe or unsubscribe a device's push token to warnings for a place",
          requestBody: body(alertTopicsSchema),
          responses: { '200': json(alertTopicsResponseSchema, 'OK'), default: error },
        },
      },
      '/client-errors': {
        post: {
          summary: "An error from a user's browser, for the server log",
          requestBody: body(clientErrorSchema),
          responses: { '204': { description: 'Logged' }, default: error },
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
