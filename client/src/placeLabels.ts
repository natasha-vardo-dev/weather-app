import type { Location } from '@weather/shared';

/** Same name, kind, region and country: two suggestions that would read exactly the same. */
function twins(a: Location, b: Location): boolean {
  return a.name === b.name && a.kind === b.kind && a.region === b.region && a.country === b.country;
}

/**
 * The grey part of each search suggestion: region and country, and, for suggestions that
 * would otherwise read exactly the same, the first level below the region at which they
 * differ (province, district, municipality). Two villages "Rode" in one Belgian province
 * and district get their municipalities, "Geetbets" and "Glabbeek"; a province shared by
 * both would not tell them apart. Only twins get longer; real duplicates stay as they are.
 */
export function describePlaces(locations: Location[]): string[] {
  return locations.map((location) => {
    const group = locations.filter((other) => twins(other, location));
    let extra: string | undefined;
    if (group.length > 1) {
      const depth = Math.max(...group.map((place) => place.areas?.length ?? 0));
      for (let level = 0; level < depth && extra === undefined; level++) {
        const values = new Set(group.map((place) => place.areas?.[level] ?? ''));
        if (values.size > 1) extra = location.areas?.[level] || undefined;
        if (values.size > 1 && extra === undefined) break;
      }
    }
    return [extra, location.region, location.country].filter(Boolean).join(', ');
  });
}

/**
 * For favourites: what tells apart saved places that would otherwise read the same (same
 * name, kind and country), from the region down: two Józefów get their voivodeships, two in
 * one voivodeship their districts. Undefined for every place whose name is not shared, so
 * Warsaw stays "Poland"; and while a place's levels are unknown (still loading, or the lookup
 * failed). A place saved without an id gets its levels from a name search, in the interface
 * language only.
 *
 * Words all the differing values share at the start or end are dropped: on a narrow tile
 * "Województwo mazowieckie" and "Województwo lubelskie" were both cut to "Województw…",
 * losing exactly the difference. "mazowieckie" / "lubelskie", and in Russian "Мазовецкое" /
 * "Люблинское" from "… воеводство". Any language, no list of words to strip.
 */
export function distinguishPlaces(
  places: {
    name: string;
    /** The same place's name in other forms (English, as saved): the interface language may
        spell namesakes differently ("Юзефув" for the town, "Józefów" for a village it has
        no Russian name for), and they must still count as having one name. */
    aliases?: string[];
    country?: string;
    kind?: string;
    region?: string;
    areas?: string[];
  }[],
): (string | undefined)[] {
  const levels = (place: (typeof places)[number]) => [place.region ?? '', ...(place.areas ?? [])];
  const names = (place: (typeof places)[number]) =>
    new Set([place.name, ...(place.aliases ?? [])].map((name) => name.toLocaleLowerCase()));
  const namesakes = (a: (typeof places)[number], b: (typeof places)[number]) => {
    const theirs = names(b);
    return [...names(a)].some((name) => theirs.has(name));
  };
  return places.map((place) => {
    const group = places.filter(
      (other) => namesakes(other, place) && other.kind === place.kind && other.country === place.country,
    );
    // Only places whose levels are known are compared: one still loading, or whose lookup
    // failed, has none, and against it a single known value would be cut to a stray word
    // ("mazowieckie" alone becoming "Voivodeship").
    const known = group.filter((other) => levels(other).some(Boolean));
    if (known.length < 2 || !known.includes(place)) return undefined;
    // Narrow down level by level to the places sharing this one's value, until it is the only
    // one left: with three Józefów, two in Masovia and one in Lublin, the Lublin one is told
    // apart by its voivodeship, the two Masovian ones only by their districts.
    let rivals = known;
    const depth = Math.max(...known.map((other) => levels(other).length));
    for (let level = 0; level < depth; level++) {
      const value = (other: (typeof places)[number]) => levels(other)[level] ?? '';
      const values = new Set(rivals.map(value));
      if (values.size === 1) continue;
      const same = rivals.filter((other) => value(other) === value(place));
      if (same.length === 1) return value(place) ? withoutSharedWords(value(place), [...values]) : undefined;
      rivals = same;
    }
    return undefined;
  });
}

/** `value` without the words every one of `values` starts or ends with (keeps at least one word). */
function withoutSharedWords(value: string, values: string[]): string {
  const split = values.filter(Boolean).map((v) => v.split(/\s+/));
  // Nothing to compare with: a value is never cut against itself.
  if (split.length < 2) return value;
  const words = value.split(/\s+/);
  const shortest = Math.min(...split.map((w) => w.length));
  let start = 0;
  while (start < shortest - 1 && split.every((w) => w[start] === split[0]![start])) start++;
  let end = 0;
  while (end < shortest - 1 - start && split.every((w) => w[w.length - 1 - end] === split[0]![split[0]!.length - 1 - end])) end++;
  return words.slice(start, words.length - end).join(' ');
}

/** Interface languages not written in Latin letters. */
const NON_LATIN = new Set(['ru', 'uk', 'ar', 'he', 'hi', 'ja', 'ko', 'zh']);

/**
 * The region to show under a place's name, or undefined:
 * - not when it repeats the name (Berlin, Tokyo, Kyiv are their own regions);
 * - not when the provider had no translation and sent it in Latin letters to an interface
 *   that is not ("South Aegean" in Russian): a word in another alphabet looked like a bug.
 *   In Latin-script interfaces an English fallback can't be told from a translation, and
 *   is left, being in the same alphabet.
 */
export function regionToShow(name: string, region: string | undefined, language: string): string | undefined {
  if (!region || region.toLocaleLowerCase() === name.toLocaleLowerCase()) return undefined;
  const untranslated = NON_LATIN.has(language) && /\p{Script=Latin}/u.test(region) && !/[^\p{Script=Latin}\p{P}\p{Z}\d]/u.test(region);
  return untranslated ? undefined : region;
}

/**
 * The line under a place's name on its page: district and region, "Powiat otwocki · Masovian
 * Voivodeship". The district (the first level under the region) is left out when it is the
 * place itself (Warsaw's district is Warsaw, Paris's is Paris: it repeats the name or the
 * level below) or the region. It is shown even when the provider has it only in the local
 * language ("Powiat otwocki" in a Russian interface): it is what tells namesakes apart.
 * The region follows `regionToShow`. The parts are returned apart, so a long line wraps
 * between them rather than inside one (as one string, "Powiat warszawski zachodni ·
 * Masovian Voivodeship" left the last word alone on a phone line).
 */
export function placeArea(
  names: { name: string; region?: string; areas?: string[] },
  language: string,
): string[] {
  const lower = (value: string) => value.toLocaleLowerCase();
  const [district = '', ...below] = names.areas ?? [];
  const region = regionToShow(names.name, names.region, language);
  const repeats = [names.name, names.region ?? '', ...below].map(lower);
  const showDistrict = district && !repeats.includes(lower(district));
  return [showDistrict ? district : undefined, region].filter((part): part is string => Boolean(part));
}
