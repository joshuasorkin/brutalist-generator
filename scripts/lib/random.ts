/**
 * Random number generation utilities.
 * Supports both Math.random and deterministic seeded PRNG.
 */

import * as crypto from 'crypto';

/**
 * Mulberry32 PRNG - fast, deterministic random number generator.
 * Returns a function that produces numbers in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Convert a string seed to a 32-bit unsigned integer via SHA256.
 */
export function seedToUint32(seedStr: string): number {
  const hash = crypto.createHash('sha256').update(seedStr).digest();
  return hash.readUInt32LE(0);
}

/**
 * Create an RNG function. If masterSeed is provided, uses deterministic PRNG.
 * Otherwise falls back to Math.random.
 */
export function makeRng(masterSeed: string, runSalt: string): () => number {
  if (!masterSeed) return Math.random;
  const s = seedToUint32(`${masterSeed}:${runSalt}`);
  return mulberry32(s);
}

/**
 * Pick a random element from an array.
 */
export function randomChoice<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Pick multiple random elements from an array (without replacement).
 * Uses Fisher-Yates shuffle for proper randomization.
 */
export function randomChoices<T>(arr: T[], count: number, rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

/**
 * Return true with the given probability.
 */
export function chance(probability: number, rng: () => number): boolean {
  return rng() < probability;
}

/**
 * Generate a random float in [min, max).
 */
export function randomFloat(min: number, max: number, rng: () => number): number {
  return min + (max - min) * rng();
}
