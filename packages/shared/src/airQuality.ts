import type { AirQuality } from './types.js';

/** Level keys; each client translates them. EAQI and US AQI name their bands differently. */
export type AirQualityLevel =
  | 'good'
  | 'fair'
  | 'moderate'
  | 'poor'
  | 'very-poor'
  | 'extremely-poor'
  | 'unhealthy-sensitive'
  | 'unhealthy'
  | 'very-unhealthy'
  | 'hazardous';

export interface AirQualitySummary {
  scale: 'european' | 'us';
  value: number;
  level: AirQualityLevel;
}

/** European Air Quality Index bands (0–100+), as published by the European Environment Agency. */
function europeanLevel(value: number): AirQualityLevel {
  if (value <= 20) return 'good';
  if (value <= 40) return 'fair';
  if (value <= 60) return 'moderate';
  if (value <= 80) return 'poor';
  if (value <= 100) return 'very-poor';
  return 'extremely-poor';
}

/** US EPA AQI bands (0–500). */
function usLevel(value: number): AirQualityLevel {
  if (value <= 50) return 'good';
  if (value <= 100) return 'moderate';
  if (value <= 150) return 'unhealthy-sensitive';
  if (value <= 200) return 'unhealthy';
  if (value <= 300) return 'very-unhealthy';
  return 'hazardous';
}

/**
 * European places whose IANA zone is not under "Europe/": the Canary Islands, Madeira,
 * the Azores, Iceland, the Faroe Islands and Cyprus.
 */
const EUROPEAN_ZONES_OUTSIDE_EUROPE = new Set([
  'Atlantic/Canary',
  'Atlantic/Madeira',
  'Atlantic/Azores',
  'Atlantic/Reykjavik',
  'Atlantic/Faroe',
  'Asia/Nicosia',
  'Asia/Famagusta',
]);

function isEuropean(timezone: string): boolean {
  return timezone.startsWith('Europe/') || EUROPEAN_ZONES_OUTSIDE_EUROPE.has(timezone);
}

/**
 * The index people at the place know: European AQI for places in Europe (by timezone),
 * US AQI elsewhere, the way Apple Weather picks the local standard. Falls back to the
 * other index when one is missing; null when there is no data at all.
 */
export function summarizeAirQuality(airQuality: AirQuality): AirQualitySummary | null {
  const preferEuropean = isEuropean(airQuality.timezone);
  const order = preferEuropean ? (['european', 'us'] as const) : (['us', 'european'] as const);
  for (const scale of order) {
    const raw = scale === 'european' ? airQuality.europeanAqi : airQuality.usAqi;
    if (raw === null) continue;
    const value = Math.round(raw);
    return { scale, value, level: scale === 'european' ? europeanLevel(value) : usLevel(value) };
  }
  return null;
}

/**
 * WHO 2021 air quality guidelines, µg/m³: 24-hour means for PM2.5, PM10 and NO₂, the
 * 8-hour mean for ozone. The app compares the current hour with them, which is a guide,
 * not a measurement over the guideline's period; the UI says "daily guideline".
 */
export const WHO_GUIDELINES = {
  pm2_5: 15,
  pm10: 45,
  ozone: 100,
  nitrogenDioxide: 25,
} as const satisfies Record<keyof AirQuality['pollutants'], number>;

/**
 * Where a value and its guideline sit on a bar, as fractions of its length (0–1). The bar
 * spans twice the guideline, so the guideline mark sits in the middle and "how far from
 * it" reads the same for every pollutant; a value above that stretches the bar instead.
 */
export function guidelineBar(value: number, guideline: number): { value: number; guideline: number } {
  const span = Math.max(guideline * 2, value);
  return { value: Math.max(0, value) / span, guideline: guideline / span };
}
