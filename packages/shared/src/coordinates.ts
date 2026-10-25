export const LATITUDE_RANGE = { min: -90, max: 90 } as const;
export const LONGITUDE_RANGE = { min: -180, max: 180 } as const;

/**
 * Plain check without zod, so clients can validate coordinates
 * without pulling the schema library into their bundle.
 */
export function isValidCoordinates(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= LATITUDE_RANGE.min &&
    latitude <= LATITUDE_RANGE.max &&
    longitude >= LONGITUDE_RANGE.min &&
    longitude <= LONGITUDE_RANGE.max
  );
}

/** Provider (GeoNames) location ids are 32-bit: Open-Meteo rejects larger ones with a 400. */
export const MAX_LOCATION_ID = 2_147_483_647;

/** A provider id that can exist: a positive 32-bit integer. Ids come from URLs and storage, so they are untrusted. */
export function isValidLocationId(id: unknown): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id > 0 && id <= MAX_LOCATION_ID;
}
