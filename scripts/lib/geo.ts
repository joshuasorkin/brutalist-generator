/**
 * Geo-based environment generation for brutalist architecture prompts.
 *
 * Generates random GPS coordinates, reverse geocodes them, and uses
 * an LLM to synthesize environment descriptions for image prompts.
 */

import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import { randomChoice, randomFloat, chance } from './random';

// ============================================================
// TYPES
// ============================================================

export type GeoMode = 'NONE' | 'ANYWHERE' | 'LAND' | 'URBAN';

export interface GeoPoint {
  lat: number;
  lon: number;
  mode: GeoMode;
}

export interface ReverseGeocodeResult {
  isLand: boolean;
  isUrban: boolean;
  country?: string;
  principalSubdivision?: string;
  city?: string;
  locality?: string;
  waterBody?: string;
}

export interface GeoCacheEntry {
  reverse: ReverseGeocodeResult;
  envText: string;
}

export type GeoCache = Record<string, GeoCacheEntry>;

// ============================================================
// CONFIGURATION
// ============================================================

const BIGDATACLOUD_ENDPOINT =
  process.env.BIGDATACLOUD_ENDPOINT ||
  'https://api.bigdatacloud.net/data/reverse-geocode-client';

const ENV_TEXT_MODEL = process.env.ENV_TEXT_MODEL || 'gpt-4o-mini';

// Mode weights: NONE=35%, ANYWHERE=20%, LAND=30%, URBAN=15%
// ANYWHERE includes ocean, which can produce interesting offshore structures
const GEO_MODE_WEIGHTS: Array<{ mode: GeoMode; weight: number }> = [
  { mode: 'NONE', weight: 0.35 },
  { mode: 'ANYWHERE', weight: 0.20 },
  { mode: 'LAND', weight: 0.30 },
  { mode: 'URBAN', weight: 0.15 },
];

// Curated urban coordinates to avoid expensive rejection sampling
// These are major cities across different continents and climates
const URBAN_SEEDS: Array<{ lat: number; lon: number; jitter: number }> = [
  // Europe
  { lat: 51.5074, lon: -0.1278, jitter: 0.3 },   // London
  { lat: 48.8566, lon: 2.3522, jitter: 0.3 },    // Paris
  { lat: 52.5200, lon: 13.4050, jitter: 0.2 },   // Berlin
  { lat: 55.7558, lon: 37.6173, jitter: 0.4 },   // Moscow
  { lat: 59.3293, lon: 18.0686, jitter: 0.2 },   // Stockholm
  { lat: 41.9028, lon: 12.4964, jitter: 0.2 },   // Rome
  { lat: 44.7866, lon: 20.4489, jitter: 0.2 },   // Belgrade
  // Asia
  { lat: 35.6762, lon: 139.6503, jitter: 0.4 },  // Tokyo
  { lat: 31.2304, lon: 121.4737, jitter: 0.5 },  // Shanghai
  { lat: 22.3193, lon: 114.1694, jitter: 0.2 },  // Hong Kong
  { lat: 1.3521, lon: 103.8198, jitter: 0.1 },   // Singapore
  { lat: 19.0760, lon: 72.8777, jitter: 0.4 },   // Mumbai
  { lat: 37.5665, lon: 126.9780, jitter: 0.3 },  // Seoul
  // Americas
  { lat: 40.7128, lon: -74.0060, jitter: 0.3 },  // New York
  { lat: 34.0522, lon: -118.2437, jitter: 0.5 }, // Los Angeles
  { lat: 41.8781, lon: -87.6298, jitter: 0.3 },  // Chicago
  { lat: -23.5505, lon: -46.6333, jitter: 0.5 }, // São Paulo
  { lat: 19.4326, lon: -99.1332, jitter: 0.4 },  // Mexico City
  { lat: -34.6037, lon: -58.3816, jitter: 0.3 }, // Buenos Aires
  // Africa & Middle East
  { lat: -33.9249, lon: 18.4241, jitter: 0.3 },  // Cape Town
  { lat: 30.0444, lon: 31.2357, jitter: 0.4 },   // Cairo
  { lat: 25.2048, lon: 55.2708, jitter: 0.3 },   // Dubai
  // Oceania
  { lat: -33.8688, lon: 151.2093, jitter: 0.3 }, // Sydney
  { lat: -37.8136, lon: 144.9631, jitter: 0.3 }, // Melbourne
];

// ============================================================
// HELPERS
// ============================================================

function formatCoord(n: number): string {
  return Number(n).toFixed(4);
}

export function geoKey(lat: number, lon: number): string {
  return `${formatCoord(lat)},${formatCoord(lon)}`;
}

/**
 * Pick a geo mode based on weighted probabilities.
 */
export function pickGeoMode(rng: () => number): GeoMode {
  const r = rng();
  let cumulative = 0;
  for (const { mode, weight } of GEO_MODE_WEIGHTS) {
    cumulative += weight;
    if (r < cumulative) return mode;
  }
  return 'NONE';
}

/**
 * Sample random coordinates anywhere on Earth.
 */
function sampleAnyCoords(rng: () => number): { lat: number; lon: number } {
  // Use proper spherical distribution for latitude
  const u = rng();
  const lat = Math.asin(2 * u - 1) * (180 / Math.PI);
  const lon = randomFloat(-180, 180, rng);
  return { lat, lon };
}

/**
 * Sample coordinates near a known urban center with jitter.
 */
function sampleUrbanCoords(rng: () => number): { lat: number; lon: number } {
  const seed = randomChoice(URBAN_SEEDS, rng);
  const lat = seed.lat + randomFloat(-seed.jitter, seed.jitter, rng);
  const lon = seed.lon + randomFloat(-seed.jitter, seed.jitter, rng);
  return { lat, lon };
}

// ============================================================
// CACHE MANAGEMENT
// ============================================================

export function getGeoCachePath(): string {
  return process.env.GEO_CACHE_PATH ||
    path.join(path.resolve(__dirname, '../..'), 'data', 'geoCache.json');
}

export function loadGeoCache(): GeoCache {
  try {
    const cachePath = getGeoCachePath();
    if (fs.existsSync(cachePath)) {
      return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    }
  } catch {
    // Ignore parse errors, start fresh
  }
  return {};
}

export function saveGeoCache(cache: GeoCache): void {
  try {
    const cachePath = getGeoCachePath();
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.warn('Warning: could not write geo cache:', e);
  }
}

// ============================================================
// REVERSE GEOCODING
// ============================================================

async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult> {
  const url = `${BIGDATACLOUD_ENDPOINT}?latitude=${lat}&longitude=${lon}&localityLanguage=en`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Reverse geocode failed: ${res.status}`);
  }

  const data: any = await res.json();

  const country = data.countryName;
  const principalSubdivision = data.principalSubdivision;
  const city = data.city;
  const locality = data.locality;

  // Check for water bodies
  const informative: any[] = data.localityInfo?.informative || [];
  const waterBody = informative.find(
    (x) => typeof x?.name === 'string' && /ocean|sea|gulf|bay|strait/i.test(x.name)
  )?.name;

  const isLand = Boolean(country) && !waterBody;
  const isUrban = Boolean(city || locality) && isLand;

  return {
    isLand,
    isUrban,
    country,
    principalSubdivision,
    city,
    locality,
    waterBody,
  };
}

// ============================================================
// COORDINATE SAMPLING
// ============================================================

/**
 * Sample coordinates based on the selected mode.
 * - NONE: returns dummy coords (won't be used)
 * - ANYWHERE: random point on Earth (may be ocean)
 * - LAND: tries to find land, falls back to ANYWHERE
 * - URBAN: uses curated urban seeds with jitter
 */
export async function sampleCoordsByMode(
  mode: GeoMode,
  rng: () => number
): Promise<GeoPoint> {
  if (mode === 'NONE') {
    return { lat: 0, lon: 0, mode };
  }

  if (mode === 'URBAN') {
    // Use curated urban coordinates - no rejection sampling needed
    const { lat, lon } = sampleUrbanCoords(rng);
    return { lat, lon, mode };
  }

  if (mode === 'LAND') {
    // Try a few times to hit land, otherwise accept any location
    const MAX_ATTEMPTS = 8;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const { lat, lon } = sampleAnyCoords(rng);
      try {
        const result = await reverseGeocode(lat, lon);
        if (result.isLand) {
          return { lat, lon, mode };
        }
      } catch {
        // Ignore and try again
      }
    }
    // Fallback: just use random coords
    const { lat, lon } = sampleAnyCoords(rng);
    return { lat, lon, mode: 'ANYWHERE' };
  }

  // ANYWHERE mode
  const { lat, lon } = sampleAnyCoords(rng);
  return { lat, lon, mode };
}

// ============================================================
// ENVIRONMENT TEXT SYNTHESIS
// ============================================================

/**
 * Use an LLM to synthesize an environment description based on geo data.
 */
async function synthesizeEnvironmentText(
  openai: OpenAI,
  geo: GeoPoint,
  reverse: ReverseGeocodeResult,
  rng: () => number
): Promise<string> {
  const mood = chance(0.5, rng) ? 'austere and imposing' : 'utilitarian and massive';

  // Build location hint
  let locationHint: string;
  if (reverse.waterBody) {
    locationHint = `open ocean, ${reverse.waterBody}`;
  } else {
    const parts = [
      reverse.city || reverse.locality,
      reverse.principalSubdivision,
      reverse.country
    ].filter(Boolean);
    locationHint = parts.join(', ') || 'a remote location';
  }

  const system = `You write compact environment descriptions for architectural photography prompts.
Output a single phrase or sentence (max 30 words). No lists. No quotation marks.
Do NOT mention coordinates or specific place names. Do NOT mention any text/signage.
Focus on: climate, natural light quality, terrain, vegetation, weather, color palette.`;

  const user = `Create an environment description for brutalist architecture photography.
Location type: ${reverse.waterBody ? 'oceanic/maritime' : reverse.isUrban ? 'urban' : 'rural/remote'}
Region hint: ${locationHint}
Mood: ${mood}
Return only the environment description, no explanation.`;

  try {
    const resp = await openai.chat.completions.create({
      model: ENV_TEXT_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.85,
      max_tokens: 60,
    });

    const text = resp.choices?.[0]?.message?.content?.trim() || '';
    // Remove any quotes that might have been added
    return text.replace(/^["']|["']$/g, '').slice(0, 200);
  } catch (e) {
    console.warn('Warning: environment synthesis failed:', e);
    return '';
  }
}

// ============================================================
// MAIN EXPORT
// ============================================================

export interface EnvironmentCueResult {
  cue: string;
  coordinates: {
    lat: number;
    lon: number;
    mode: GeoMode;
  };
}

/**
 * Generate an environment cue based on random GPS coordinates.
 * Returns null if mode is NONE or if synthesis fails.
 * Includes the coordinates used for logging purposes.
 */
export async function generateEnvironmentCue(
  openai: OpenAI,
  imageIndex: number,
  rng: () => number,
  geoCache: GeoCache
): Promise<EnvironmentCueResult | null> {
  const mode = pickGeoMode(rng);

  if (mode === 'NONE') {
    return null;
  }

  try {
    const geo = await sampleCoordsByMode(mode, rng);
    const key = geoKey(geo.lat, geo.lon);

    // Check cache first
    let entry = geoCache[key];
    if (!entry) {
      const reverse = await reverseGeocode(geo.lat, geo.lon);
      const envText = await synthesizeEnvironmentText(openai, geo, reverse, rng);

      if (envText) {
        entry = { reverse, envText };
        geoCache[key] = entry;
        saveGeoCache(geoCache);
      }
    }

    if (entry?.envText) {
      return {
        cue: `environment: ${entry.envText}`,
        coordinates: {
          lat: geo.lat,
          lon: geo.lon,
          mode: geo.mode,
        },
      };
    }
  } catch (e) {
    console.warn(`Warning: geo cue generation failed for image ${imageIndex}:`, e);
  }

  return null;
}
