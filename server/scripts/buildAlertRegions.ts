/**
 * Builds server/data/meteoalarm-regions.json.gz from MeteoAlarm's published region
 * boundaries (EMMA_IDs). Run when MeteoAlarm publishes a new file:
 *
 *   npx tsx server/scripts/buildAlertRegions.ts [version]
 *
 * The source is ~33 MB of GeoJSON; borders are simplified to ~100 m and coordinates
 * rounded, so the result is small enough for the repository and the server's memory.
 * Places are rounded to ~1 km anyway, and regions within NEAR_REGION_KM count as hits.
 */
import { writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { bboxOf, type Point, type Polygon, type Region, type RegionsFile } from '../src/services/regions.js';

const VERSION = process.argv[2] ?? '2026_07_31';
const SOURCE = `https://gitlab.com/meteoalarm-pm-group/documents/-/raw/master/MeteoAlarm_Geocodes_${VERSION}.json`;
const OUTPUT = new URL('../data/meteoalarm-regions.json.gz', import.meta.url);
/** ~100 m in degrees of latitude. */
const TOLERANCE = 0.001;
const DECIMALS = 3;

interface SourceFeature {
  properties: { code: string; country: string; name: string; type: string };
  geometry: { type: 'Polygon'; coordinates: Point[][] } | { type: 'MultiPolygon'; coordinates: Point[][][] };
}

function perpendicular([x, y]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(x - ax, y - ay);
  return Math.abs(dy * x - dx * y + bx * ay - by * ax) / length;
}

/** Douglas–Peucker, iterative (rings have tens of thousands of points). */
function simplify(points: Point[]): Point[] {
  if (points.length <= 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let distance = TOLERANCE;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicular(points[i]!, points[first]!, points[last]!);
      if (d > distance) {
        distance = d;
        farthest = i;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const round = (n: number) => Number(n.toFixed(DECIMALS));

function simplifyRing(ring: Point[]): Point[] | null {
  const simplified = simplify(ring).map(([lon, lat]): Point => [round(lon), round(lat)]);
  const unique = simplified.filter((p, i) => i === 0 || p[0] !== simplified[i - 1]![0] || p[1] !== simplified[i - 1]![1]);
  // A ring needs 3 distinct corners plus the closing point; smaller ones are slivers.
  return unique.length >= 4 ? unique : null;
}

function simplifyPolygon(polygon: Point[][]): Polygon | null {
  const [outer, ...holes] = polygon.map(simplifyRing);
  if (!outer) return null;
  return [outer, ...holes.filter((ring): ring is Point[] => ring !== null)];
}

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`${SOURCE}: HTTP ${response.status}`);
const source = (await response.json()) as { features: SourceFeature[] };

let dropped = 0;
const regions: Region[] = [];
for (const { properties, geometry } of source.features) {
  if (properties.type !== 'EMMA_ID') continue;
  const parts = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const polygons = parts.map(simplifyPolygon).filter((p): p is Polygon => p !== null);
  if (polygons.length === 0) {
    dropped++;
    continue;
  }
  regions.push({ code: properties.code, country: properties.country, name: properties.name, bbox: bboxOf(polygons), polygons });
}

const file: RegionsFile = { source: SOURCE, version: VERSION, regions };
const json = JSON.stringify(file);
const gzipped = gzipSync(json, { level: 9 });
await writeFile(OUTPUT, gzipped);
console.log(
  `${regions.length} regions (${dropped} dropped), ${(json.length / 1e6).toFixed(1)} MB JSON, ` +
    `${(gzipped.length / 1e6).toFixed(2)} MB gzipped -> ${OUTPUT.pathname}`,
);
