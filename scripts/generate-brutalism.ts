/**
 * Brutalist Architecture Image Generator
 *
 * Generates AI images of brutalist architecture using OpenAI's image API.
 * Features:
 * - Rich prompt vocabulary with multiple dimensions of variation
 * - Optional GPS-based environment cues for geographic variety
 * - Deterministic seeding for reproducible batches
 * - Manifest tracking for incremental generation
 *
 * Usage:
 *   npm run generate:brutalism              # Generate images
 *   npm run generate:brutalism -- --seed X  # Reproducible generation
 *   npm run test:model                      # Test API access
 */

import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

import { makeRng, randomChoice, randomChoices, chance } from './lib/random';
import {
  BUILDING_PREFIX,
  BUILDING_TYPES,
  LIGHTING_CONDITIONS,
  STYLISTIC_ELEMENTS,
  MASSING_ARCHETYPES,
  CONCRETE_EXPRESSIONS,
  FENESTRATION_PATTERNS,
  CONTEXTS,
  CAMERA_ANGLES,
  REGIONAL_STYLES,
  CONDITIONS,
  PHOTO_STYLES,
  MUTATIONS,
  BASE_PROMPT_SUFFIX,
} from './lib/prompt-vocabulary';
import { generateEnvironmentCue, loadGeoCache, GeoCache, EnvironmentCueResult } from './lib/geo';

// Load environment variables
dotenv.config({ path: '.env.local' });

// ============================================================
// CONFIGURATION
// ============================================================

const TEST_MODE = process.argv.includes('--test');
const NUM_IMAGES = 123;

/**
 * Optional deterministic seeding for reproducible prompt generation.
 * Usage:
 *   MASTER_SEED=2025-12-23 npm run generate:brutalism
 *   npm run generate:brutalism -- --seed myBatch42
 */
const MASTER_SEED =
  process.env.MASTER_SEED ||
  (() => {
    const idx = process.argv.indexOf('--seed');
    return idx >= 0 ? process.argv[idx + 1] : '';
  })();

// ============================================================
// PROMPT BUILDER
// ============================================================

interface PromptResult {
  prompt: string;
  coordinates?: {
    lat: number;
    lon: number;
    mode: string;
  };
}

/**
 * Build a prompt with controlled randomization across multiple dimensions.
 * Optionally includes GPS-derived environment cues.
 * Returns both the prompt and any coordinates used.
 */
async function buildPrompt(
  openai: OpenAI,
  imageIndex: number,
  geoCache: GeoCache
): Promise<PromptResult> {
  const rng = makeRng(MASTER_SEED, `img:${imageIndex}`);

  // Core elements (always included)
  const building = `${BUILDING_PREFIX} ${randomChoice(BUILDING_TYPES, rng)}`;
  const lighting = randomChoice(LIGHTING_CONDITIONS, rng);
  const massing = randomChoice(MASSING_ARCHETYPES, rng);
  const concrete = randomChoice(CONCRETE_EXPRESSIONS, rng);
  const fenestration = randomChoice(FENESTRATION_PATTERNS, rng);
  const context = randomChoice(CONTEXTS, rng);
  const camera = randomChoice(CAMERA_ANGLES, rng);

  // Secondary elements (sampled)
  const styles = randomChoices(STYLISTIC_ELEMENTS, 2, rng);
  const photoStyle = randomChoice(PHOTO_STYLES, rng);

  // Optional elements (probability-based)
  const regional = chance(0.4, rng) ? randomChoice(REGIONAL_STYLES, rng) : null;
  const condition = chance(0.5, rng) ? randomChoice(CONDITIONS, rng) : null;
  const mutation = chance(0.1, rng) ? randomChoice(MUTATIONS, rng) : null;
  const scaleCue = chance(0.25, rng) ? 'small human figures for scale' : null;

  // GPS-derived environment cue (async)
  const envResult = await generateEnvironmentCue(openai, imageIndex, rng, geoCache);

  // Assemble prompt
  const parts = [
    building,
    massing,
    concrete,
    fenestration,
    context,
    envResult?.cue,
    lighting,
    regional,
    condition,
    ...styles,
    camera,
    photoStyle,
    scaleCue,
    mutation,
    BASE_PROMPT_SUFFIX,
  ].filter(Boolean);

  return {
    prompt: parts.join(', '),
    coordinates: envResult?.coordinates,
  };
}

// ============================================================
// HELPERS
// ============================================================

function padNumber(num: number, length: number): string {
  return num.toString().padStart(length, '0');
}

async function ensureDirectory(dirPath: string): Promise<void> {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

async function generateImage(
  openai: OpenAI,
  prompt: string
): Promise<{ buffer: Buffer; model: string }> {
  let modelUsed = 'gpt-image-1';

  try {
    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
    });

    const imageData = response.data?.[0];
    if (!imageData) throw new Error('No image data returned');

    if (imageData.b64_json) {
      return { buffer: Buffer.from(imageData.b64_json, 'base64'), model: modelUsed };
    } else if (imageData.url) {
      const imgRes = await fetch(imageData.url);
      const arrayBuffer = await imgRes.arrayBuffer();
      return { buffer: Buffer.from(arrayBuffer), model: modelUsed };
    }

    throw new Error('No image data in response');
  } catch (err: any) {
    if (err?.status === 403) {
      console.log('  gpt-image-1 denied, falling back to dall-e-3...');
      modelUsed = 'dall-e-3';

      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'hd',
      });

      const imageData = response.data?.[0];
      if (!imageData) throw new Error('No image data returned');

      if (imageData.b64_json) {
        return { buffer: Buffer.from(imageData.b64_json, 'base64'), model: modelUsed };
      } else if (imageData.url) {
        const imgRes = await fetch(imageData.url);
        const arrayBuffer = await imgRes.arrayBuffer();
        return { buffer: Buffer.from(arrayBuffer), model: modelUsed };
      }

      throw new Error('No image data in response');
    }
    throw err;
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('ERROR: OPENAI_API_KEY environment variable is not set.');
    console.error('Please create a .env.local file with your API key.');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey });

  const projectRoot = path.resolve(__dirname, '..');
  const publicBrutalismDir = path.join(projectRoot, 'public', 'brutalism');
  const dataDir = path.join(projectRoot, 'data');
  const manifestPath = path.join(dataDir, 'brutalismManifest.json');
  const promptLogPath = path.join(dataDir, 'promptLog.json');

  await ensureDirectory(publicBrutalismDir);
  await ensureDirectory(dataDir);

  // Load geo cache for environment cues
  const geoCache = loadGeoCache();

  // Load prompt log (maps filename -> generation metadata)
  interface PromptLogEntry {
    prompt: string;
    model: string;
    generatedAt: string;
    coordinates?: { lat: number; lon: number; mode: string };
  }
  let promptLog: Record<string, PromptLogEntry> = {};
  if (fs.existsSync(promptLogPath)) {
    try {
      promptLog = JSON.parse(fs.readFileSync(promptLogPath, 'utf-8'));
    } catch {
      // Start fresh if parse fails
    }
  }

  // Test mode
  if (TEST_MODE) {
    console.log('\n=== TEST MODE ===');
    console.log('Testing image model access...\n');

    const { prompt, coordinates } = await buildPrompt(openai, 1, geoCache);
    console.log(`Prompt: ${prompt.substring(0, 160)}...`);
    if (coordinates) {
      console.log(`Coordinates: ${coordinates.lat.toFixed(4)}, ${coordinates.lon.toFixed(4)} (${coordinates.mode})`);
    }
    if (MASTER_SEED) console.log(`MASTER_SEED: ${MASTER_SEED}`);

    try {
      const { model } = await generateImage(openai, prompt);
      console.log(`\n✓ SUCCESS: Used model "${model}"`);
    } catch (error) {
      console.error('\n✗ FAILED:', error);
      process.exit(1);
    }

    console.log('\n=== TEST COMPLETE ===\n');
    process.exit(0);
  }

  // Load manifest
  let manifest: { images: string[] } = { images: [] };
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      console.log(`Loaded manifest with ${manifest.images.length} images.`);
    } catch {
      console.log('Could not parse manifest, starting fresh.');
    }
  }

  console.log(`\nGenerating ${NUM_IMAGES} brutalist architecture images...\n`);
  if (MASTER_SEED) console.log(`MASTER_SEED: ${MASTER_SEED}\n`);

  let skipped = 0;
  let generated = 0;
  let failed = 0;

  for (let i = 1; i <= NUM_IMAGES; i++) {
    const filename = `brutalism_${padNumber(i, 4)}.png`;
    const filePath = path.join(publicBrutalismDir, filename);
    const publicPath = `/brutalism/${filename}`;

    // Skip existing
    if (fs.existsSync(filePath)) {
      if (!manifest.images.includes(publicPath)) {
        manifest.images.push(publicPath);
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      }
      skipped++;
      console.log(`[${i}/${NUM_IMAGES}] Skipping (exists): ${filename}`);
      continue;
    }

    try {
      const { prompt, coordinates } = await buildPrompt(openai, i, geoCache);
      console.log(`[${i}/${NUM_IMAGES}] Generating: ${filename}`);
      console.log(`  Prompt: ${prompt.substring(0, 180)}...`);

      const { buffer, model } = await generateImage(openai, prompt);
      fs.writeFileSync(filePath, buffer);

      manifest.images.push(publicPath);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      // Log prompt metadata (including coordinates if geo was used)
      promptLog[filename] = {
        prompt,
        model,
        generatedAt: new Date().toISOString(),
        ...(coordinates && { coordinates }),
      };
      fs.writeFileSync(promptLogPath, JSON.stringify(promptLog, null, 2));

      generated++;
      console.log(`  Saved (${model}): ${filename}\n`);
    } catch (error) {
      failed++;
      console.error(`  ERROR generating image ${i}:`, error);
      console.error('  Continuing...\n');
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Generation Complete');
  console.log('='.repeat(50));
  console.log(`Total in manifest: ${manifest.images.length}`);
  console.log(`Skipped (existed): ${skipped}`);
  console.log(`Newly generated:   ${generated}`);
  console.log(`Failed:            ${failed}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
