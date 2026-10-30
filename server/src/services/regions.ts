import { readFile } from 'node:fs/promises';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';

/** [longitude, latitude], as in GeoJSON. */
export type Point = [number, number];
/** Outer ring first, then holes; rings are closed (first point = last point). */
export type Polygon = Point[][];
/** [west, south, east, north] */
export type BBox = [number, number, number, number];

export interface Region {
  /** MeteoAlarm's EMMA_ID, e.g. "PL1465". */
  code: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  name: string;
  bbox: BBox;
  polygons: Polygon[];
}

/** The data file written by scripts/buildAlertRegions.ts. */
export interface RegionsFile {
  source: string;
  version: string;
  regions: Region[];
}

/**
 * How close to a region a place may be and still get its warnings. Places are rounded to
 * ~1 km (URL, caches) and borders simplified to ~100 m, so a town by a county border may
 * land in the neighbour. A warning too many beats a warning missed.
 */
export const NEAR_REGION_KM = 1.5;

/**
 * The search radius when no region is within NEAR_REGION_KM: the borders file draws coasts
 * coarsely, and seaside towns can fall "into the sea" (Kos town lies 1.7 km beyond the
 * island's outline, Reykjavik 2–3 km). Used only then, so it never adds regions elsewhere;
 * a point truly at sea near a coast gets that coast's warnings, which suits a forecast.
 */
export const COAST_FALLBACK_KM = 5;

const KM_PER_DEGREE = 111.32;

export function bboxOf(polygons: Polygon[]): BBox {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const polygon of polygons) {
    for (const [lon, lat] of polygon[0] ?? []) {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  return [west, south, east, north];
}

/** Grows a bbox by `km` on every side (enough at European latitudes, up to ~72°N). */
function grow([west, south, east, north]: BBox, km: number, latitude: number): BBox {
  const dLat = km / KM_PER_DEGREE;
  const dLon = km / (KM_PER_DEGREE * Math.max(Math.cos((latitude * Math.PI) / 180), 0.2));
  return [west - dLon, south - dLat, east + dLon, north + dLat];
}

export function bboxContains([west, south, east, north]: BBox, [lon, lat]: Point): boolean {
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

/**
 * Grid cells for push topics where warnings come as drawn polygons (no region codes): a
 * device subscribes to the cell it is in, a warning is published to the cells it touches.
 * 0.25° (~28 × 15 km in Europe): small enough to stay near the warning, large enough that a
 * sea-area warning does not touch thousands of cells.
 */
export const CELL_DEGREES = 0.25;

export function cellKey(latitude: number, longitude: number): string {
  return `c${Math.floor(latitude / CELL_DEGREES)}_${Math.floor(longitude / CELL_DEGREES)}`;
}

/**
 * Cells a warning area touches: those whose centre is inside it or within half a cell's
 * diagonal of it, so a place anywhere in a touched cell is never missed (at the cost of a
 * few places just outside the area being told too).
 */
export function cellsCovering(polygons: Polygon[]): string[] {
  const [west, south, east, north] = bboxOf(polygons);
  const cells: string[] = [];
  for (let row = Math.floor(south / CELL_DEGREES); row * CELL_DEGREES <= north; row++) {
    const lat = (row + 0.5) * CELL_DEGREES;
    const halfDiagonalKm =
      (Math.hypot(CELL_DEGREES, CELL_DEGREES * Math.cos((lat * Math.PI) / 180)) * KM_PER_DEGREE) / 2;
    for (let col = Math.floor(west / CELL_DEGREES); col * CELL_DEGREES <= east; col++) {
      const lon = (col + 0.5) * CELL_DEGREES;
      if (polygonsNear(polygons, [lon, lat], halfDiagonalKm)) cells.push(`c${row}_${col}`);
    }
  }
  return cells;
}

/** Ray casting: whether the point is inside a closed ring. */
function inRing([x, y]: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonContains(polygon: Polygon, point: Point): boolean {
  const [outer, ...holes] = polygon;
  return !!outer && inRing(point, outer) && !holes.some((hole) => inRing(point, hole));
}

/** Distance from a point to a ring's edges in km, in a local flat projection (fine for a few km). */
function ringDistanceKm([lon, lat]: Point, ring: Point[]): number {
  const kx = KM_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
  const ky = KM_PER_DEGREE;
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const ax = (ring[i - 1]![0] - lon) * kx;
    const ay = (ring[i - 1]![1] - lat) * ky;
    const bx = (ring[i]![0] - lon) * kx;
    const by = (ring[i]![1] - lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** Inside, or within `km` of the edge. */
export function polygonsNear(polygons: Polygon[], point: Point, km: number): boolean {
  return polygons.some(
    (polygon) => polygonContains(polygon, point) || polygon.some((ring) => ringDistanceKm(point, ring) <= km),
  );
}

/**
 * Region boundaries (MeteoAlarm EMMA_IDs) with a bbox prefilter: a point is tested against
 * the few regions whose box is near it, not all ~2000.
 */
export class RegionIndex {
  private readonly byCode: Map<string, Region>;

  constructor(private readonly regions: Region[]) {
    this.byCode = new Map(regions.map((region) => [region.code, region]));
  }

  has(code: string): boolean {
    return this.byCode.has(code);
  }

  /** Codes of the regions the point is in or within NEAR_REGION_KM of. */
  codesNear(latitude: number, longitude: number, km = NEAR_REGION_KM): Set<string> {
    const point: Point = [longitude, latitude];
    const codes = new Set<string>();
    for (const region of this.regions) {
      if (!bboxContains(grow(region.bbox, km, latitude), point)) continue;
      if (polygonsNear(region.polygons, point, km)) codes.add(region.code);
    }
    return codes;
  }

  /**
   * Whether the point is inside some region by more than `km` from its edge: surely in that
   * region's country despite rounded places and simplified borders.
   */
  isWellInside(latitude: number, longitude: number, km: number): boolean {
    const point: Point = [longitude, latitude];
    return this.regions.some(
      (region) =>
        bboxContains(region.bbox, point) &&
        region.polygons.some(
          (polygon) => polygonContains(polygon, point) && polygon.every((ring) => ringDistanceKm(point, ring) > km),
        ),
    );
  }

  /** Countries of these regions (from codesNear): whose feeds to read. */
  countriesOf(codes: Iterable<string>): Set<string> {
    const countries = new Set<string>();
    for (const code of codes) {
      const region = this.byCode.get(code);
      if (region) countries.add(region.country);
    }
    return countries;
  }
}

const gunzipAsync = promisify(gunzip);

/** Reads the gzipped regions file (data/meteoalarm-regions.json.gz). */
export async function loadRegions(path: URL | string): Promise<RegionsFile> {
  const raw = await gunzipAsync(await readFile(path));
  return JSON.parse(raw.toString('utf8')) as RegionsFile;
}
