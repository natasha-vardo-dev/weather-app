/**
 * Light checks of the API's answers, for clients: what a client relies on is there and of
 * the right kind, so an answer of an unexpected shape is caught at the API client instead of
 * crashing a page. Such answers come from caches more than from the server: a browser once
 * kept a day-old answer from before a field existed, and the page fell over reading it.
 *
 * Deliberately shallow and without zod (it would join the web bundle); the full contract is
 * checked on the server's side (responseSchemas.ts). Fields the API marks optional are not
 * required here: clients already treat them as maybe missing.
 */

type Check = (body: unknown) => boolean;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isString = (value: unknown): value is string => typeof value === 'string';

const hasCoordinates = (body: Record<string, unknown>) => isNumber(body.latitude) && isNumber(body.longitude);

export const isLocation: Check = (body) =>
  isObject(body) && isNumber(body.id) && isString(body.name) && hasCoordinates(body);

export const isLocationsResponse: Check = (body) =>
  isObject(body) && Array.isArray(body.locations) && body.locations.every(isLocation);

export const isForecast: Check = (body) =>
  isObject(body) &&
  hasCoordinates(body) &&
  isString(body.timezone) &&
  isObject(body.current) &&
  isNumber(body.current.temperature) &&
  isString(body.current.time) &&
  Array.isArray(body.hourly) &&
  Array.isArray(body.daily) &&
  body.daily.length > 0;

export const isForecastsResponse: Check = (body) =>
  isObject(body) &&
  Array.isArray(body.forecasts) &&
  body.forecasts.every((item) => isObject(item) && (isForecast(item.forecast) || isObject(item.error)));

export const isAirQuality: Check = (body) => isObject(body) && isString(body.timezone) && isObject(body.pollutants);

export const isReversePlace: Check = (body) => isObject(body) && isString(body.name) && hasCoordinates(body);

export const isAlertsResponse: Check = (body) => isObject(body) && Array.isArray(body.alerts);

export const isAlertTopicsResponse: Check = (body) => isObject(body) && Array.isArray(body.areas);
