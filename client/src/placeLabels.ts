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
