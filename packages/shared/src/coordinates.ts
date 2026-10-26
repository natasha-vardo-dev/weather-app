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

/** How far from a city's centre someone may be and still be "in" it (big cities are ~20 km across). */
export const CITY_MATCH_KM = 25;

/** Great-circle distance in km (haversine): good enough for "is it the same city". */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
