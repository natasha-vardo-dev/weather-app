/**
 * The browser's Geolocation API as plain functions (no React), so the rules are testable:
 * how errors map and how coordinates are rounded.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Why the location is unknown; each has its own message. */
export type LocationError = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

const OPTIONS: PositionOptions = {
  // A city-level answer is enough for weather; GPS would be slower and drain the battery.
  enableHighAccuracy: false,
  timeout: 10_000,
  // A position from the last 10 minutes is still right for the weather.
  maximumAge: 10 * 60 * 1000,
};

/**
 * ~1 km, as everywhere in the app: shares caches with nearby users, and the exact
 * position never reaches the URL, the server or its logs.
 */
export function roundCoordinates({ latitude, longitude }: Coordinates): Coordinates {
  return { latitude: Number(latitude.toFixed(2)), longitude: Number(longitude.toFixed(2)) };
}

/** GeolocationPositionError codes: 1 denied, 2 unavailable, 3 timeout. */
export function toLocationError(err: unknown): LocationError {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 1) return 'denied';
  if (code === 3) return 'timeout';
  return 'unavailable';
}

/** The rounded position; rejects with a LocationError. Shows the browser's prompt if needed. */
export function getCurrentPosition(
  geolocation: Geolocation | undefined = globalThis.navigator?.geolocation,
): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    // Missing in old browsers and on insecure (http) pages.
    if (!geolocation) {
      reject('unsupported' satisfies LocationError);
      return;
    }
    geolocation.getCurrentPosition(
      (position) => resolve(roundCoordinates(position.coords)),
      (err) => reject(toLocationError(err)),
      OPTIONS,
    );
  });
}

const HERE_KEY = 'here:v2';

/** How the place the user opened as "my location" was found. */
export type Whereabouts = 'exact' | 'approximate';

/**
 * The last place opened as "my location" this session, so the city page can mark it:
 * "You are here", or "Approximate, by IP" when it was guessed from the address.
 * Not in the URL: a shared link would tell the recipient they are there.
 */
export function rememberPosition(position: Coordinates, how: Whereabouts = 'exact'): void {
  try {
    sessionStorage.setItem(HERE_KEY, JSON.stringify({ ...roundCoordinates(position), how }));
  } catch {
    // Storage blocked: the mark is just not shown.
  }
}

/** How the place at these coordinates was found this session, or null if it wasn't. */
export function rememberedPosition(latitude: number, longitude: number): Whereabouts | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(HERE_KEY) ?? 'null') as (Coordinates & { how?: unknown }) | null;
    const here = roundCoordinates({ latitude, longitude });
    if (saved?.latitude !== here.latitude || saved?.longitude !== here.longitude) return null;
    return saved.how === 'approximate' ? 'approximate' : 'exact';
  } catch {
    return null;
  }
}
