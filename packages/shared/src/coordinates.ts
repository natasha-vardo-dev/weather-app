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
