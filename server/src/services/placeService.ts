import { CITY_MATCH_KM, distanceKm, type Location, type ReversePlace } from '@weather/shared';
import type { ReverseGeocoder } from '../providers/types.js';
import { TtlCache } from './cache.js';

/** City search, as the weather service offers it (cached there). */
export interface CitySearch {
  searchLocations(query: string, limit: number, language: string): Promise<Location[]>;
}

const round = (n: number) => Number(n.toFixed(2));

/**
 * The place at the user's location.
 *
 * The geocoder names it; then the city is looked up in the search geocoder by that name,
 * and the nearest result within CITY_MATCH_KM is used: its coordinates and id. Otherwise
 * "my location" would be the user's own ~1 km cell, a different place from the same city
 * saved from search (52.25,21.05 vs 52.23,21.01): "Save" would add Warsaw a second time.
 * With the id, the name also follows the UI language like any searched city.
 *
 * The cache is what makes a 1-request-per-second geocoder usable: people near each other
 * share a ~1 km key, and names change very rarely.
 */
/** A place, and whether it may be cached (false when city search failed, see reverse). */
export interface ReverseResult {
  place: ReversePlace | null;
  cacheable: boolean;
}

export class PlaceService {
  /** null caches "no place here" too, so the sea is not asked about again. */
  private readonly cache: TtlCache<ReversePlace | null>;

  constructor(
    private readonly geocoder: ReverseGeocoder,
    private readonly cities: CitySearch,
    ttlMs = 7 * 24 * 60 * 60 * 1000,
  ) {
    this.cache = new TtlCache(ttlMs);
  }

  /**
   * When city search fails, the answer is the bare position: still useful, but a fallback
   * forced by an error, so it is not cached (here or by browsers). Cached, one search
   * hiccup would pin the unmatched position for everyone nearby for a week, bringing the
   * duplicate-city problem back. Only real results are cached: a match, "no city near
   * enough", or "no place here".
   */
  async reverse(latitude: number, longitude: number, language = 'en'): Promise<ReverseResult> {
    // Same ~1 km rounding as forecasts; the language changes the names.
    const here = { latitude: round(latitude), longitude: round(longitude) };
    const key = `${language}:${here.latitude}:${here.longitude}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return { place: cached, cacheable: true };

    const named = await this.geocoder.reverse(here.latitude, here.longitude, language);
    if (!named) {
      this.cache.set(key, null);
      return { place: null, cacheable: true };
    }
    let city: ReversePlace | null;
    try {
      city = await this.matchCity(named.name, here, language);
    } catch {
      // Matching is an improvement, not a requirement: answer with the position, uncached.
      return { place: { ...named, ...here }, cacheable: false };
    }
    const place = city ?? { ...named, ...here };
    this.cache.set(key, place);
    return { place, cacheable: true };
  }

  /** The searched city of that name nearest to the position, if close enough; throws if search fails. */
  private async matchCity(
    name: string,
    here: { latitude: number; longitude: number },
    language: string,
  ): Promise<ReversePlace | null> {
    const results: Location[] = await this.cities.searchLocations(name, 10, language);
    let best: { city: Location; km: number } | null = null;
    for (const city of results) {
      const km = distanceKm(here, city);
      if (km <= CITY_MATCH_KM && (!best || km < best.km)) best = { city, km };
    }
    if (!best) return null;
    const { id, name: cityName, country, latitude, longitude } = best.city;
    return { id, name: cityName, ...(country ? { country } : {}), latitude: round(latitude), longitude: round(longitude) };
  }
}
