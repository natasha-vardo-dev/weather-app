import { isValidCoordinates, isValidLocationId } from '@weather/shared';

/** What a weather page needs to know about a place: coordinates plus display info. */
export interface Place {
  latitude: number;
  longitude: number;
  name: string;
  country?: string;
  /** GeoNames id (Open-Meteo's location id), if the place came from search. */
  id?: number;
}

/** ~1 km precision: enough for weather, and identical URLs for nearby places help caching. */
function round(value: number): string {
  return value.toFixed(2);
}

/** Letters NFD does not split into a base letter and a mark, and two whole alphabets. */
const LATIN: Record<string, string> = {
  ł: 'l',
  đ: 'd',
  ß: 'ss',
  æ: 'ae',
  ø: 'o',
  œ: 'oe',
  ı: 'i',
  þ: 'th',
  ð: 'd',
  // Russian, Ukrainian, Belarusian
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  ґ: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  є: 'ye',
  ж: 'zh',
  з: 'z',
  и: 'i',
  і: 'i',
  ї: 'yi',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ў: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  // Greek
  α: 'a',
  β: 'v',
  γ: 'g',
  δ: 'd',
  ε: 'e',
  ζ: 'z',
  η: 'i',
  θ: 'th',
  ι: 'i',
  κ: 'k',
  λ: 'l',
  μ: 'm',
  ν: 'n',
  ξ: 'x',
  ο: 'o',
  π: 'p',
  ρ: 'r',
  σ: 's',
  ς: 's',
  τ: 't',
  υ: 'y',
  φ: 'f',
  χ: 'ch',
  ψ: 'ps',
  ω: 'o',
};

/**
 * The readable part of a place link, in plain Latin letters: "Kraków" → "krakow", "Варшава"
 * → "varshava", "Ηράκλειο" → "irakleio". Other scripts (Chinese, Arabic…) give "" and the
 * link is the id alone. Decoration only: the id opens the place, and the page swaps the
 * slug for the English one ("warsaw") once it knows it.
 */
export function slugify(name: string): string {
  return (
    name
      .toLocaleLowerCase()
      // The table first, on whole letters: decomposing first would turn "й" into "и" plus a
      // mark and "ї" into "і" plus one, so Київ came out "kiiv", not "kyiv".
      .normalize('NFC')
      .replace(/./gu, (char) => LATIN[char] ?? char)
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      // And again on what accents leave: Greek "ά" is in no table, its "α" is.
      .replace(/./gu, (char) => LATIN[char] ?? char)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '')
  );
}

/**
 * URL for a place.
 *
 * - From search (has a GeoNames id): /weather/756135-warsaw. The id identifies the place;
 *   the slug is for people and is not trusted. One link per city, the same in every
 *   language: name and country are shown in the reader's language, looked up by the id.
 * - Anything else (a position without a matching city): /weather/52.25,21.05?name=…, the
 *   coordinates identify it and the name rides along, as nothing else knows it.
 *
 * GeoNames ids are not the weather provider's own: they outlive a change of provider, which
 * was the reason links used to carry coordinates only.
 */
export function placePath(place: Omit<Place, 'name'> & { name?: string }): string {
  if (place.id && isValidLocationId(place.id)) {
    const slug = place.name ? slugify(place.name) : '';
    return `/weather/${place.id}${slug ? `-${slug}` : ''}`;
  }
  const params = new URLSearchParams();
  if (place.name) params.set('name', place.name);
  if (place.country) params.set('country', place.country);
  const query = params.toString();
  return `/weather/${round(place.latitude)},${round(place.longitude)}${query ? `?${query}` : ''}`;
}

/** Name shown for a link without one: "52.23, 21.01". */
export function coordinatesLabel(latitude: number, longitude: number): string {
  return `${round(latitude)}, ${round(longitude)}`;
}

/** What a /weather/… link points at. */
export type PlaceRoute =
  /** /weather/756135-warsaw: the place is looked up by its id. */
  | { kind: 'id'; id: number; slug: string }
  /** /weather/52.23,21.01?name=…: coordinates, plus an id in older links. */
  | { kind: 'coords'; place: Place };

/** Reads the part after /weather/. Null for anything that is neither form. */
export function parsePlaceRoute(segment: string | undefined, search: URLSearchParams): PlaceRoute | null {
  // The id decides; whatever follows the dash is not checked ("756135-Warsaw", "756135-варшава"
  // typed by hand): the page replaces it with the canonical slug.
  const byId = /^(\d+)(?:-(.*))?$/s.exec(segment ?? '');
  if (byId) {
    const id = Number(byId[1]);
    return isValidLocationId(id) ? { kind: 'id', id, slug: byId[2] ?? '' } : null;
  }
  const place = parsePlace(segment, search);
  return place ? { kind: 'coords', place } : null;
}

/** Reads a coordinates link. Returns null for invalid coordinates. */
export function parsePlace(coords: string | undefined, search: URLSearchParams): Place | null {
  const [lat, lon, ...rest] = (coords ?? '').split(',');
  if (rest.length > 0) return null;

  if (!lat?.trim() || !lon?.trim()) return null;
  if (!isValidCoordinates(Number(lat), Number(lon))) return null;

  const latitude = Number(round(Number(lat)));
  const longitude = Number(round(Number(lon)));
  const name = search.get('name')?.trim() || coordinatesLabel(latitude, longitude);
  const country = search.get('country')?.trim() || undefined;
  // Links made before ids moved into the path carry it here. Untrusted, like the name: the
  // page uses it only once it is confirmed to be this place, and an invalid one is ignored.
  const rawId = Number(search.get('id'));
  const id = isValidLocationId(rawId) ? rawId : undefined;

  return { latitude, longitude, name, country, ...(id ? { id } : {}) };
}

/** Rounded like coordinates links, so caches, favourites and "You are here" match. */
export function roundedPlace(place: Place): Place {
  return { ...place, latitude: Number(round(place.latitude)), longitude: Number(round(place.longitude)) };
}
