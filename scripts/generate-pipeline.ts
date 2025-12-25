/**
 * Image Generation Pipeline
 *
 * Generates new brutalist images and deploys them to R2 in a single operation.
 *
 * Usage:
 *   npm run pipeline -- --count=10
 *   npm run pipeline -- -n 10
 *
 * Steps:
 *   1. Generate N new images (PNG) via OpenAI
 *   2. Export to BrutalFrame (compressed JPEG)
 *   3. Copy new images to public/images
 *   4. Upload new images to R2
 *   5. Update manifest with R2 URLs
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ============================================================
// CONFIG
// ============================================================

const PROJECT_ROOT = path.resolve(__dirname, '..');
const R2_BASE_URL = 'https://pub-67c7e0f9d9114d5582a2d1212dd3ff7c.r2.dev';

// ============================================================
// HELPERS
// ============================================================

function run(cmd: string, description: string): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Step: ${description}`);
  console.log('='.repeat(60));
  console.log(`> ${cmd}\n`);

  try {
    execSync(cmd, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: 'cmd.exe'
    });
  } catch (error) {
    console.error(`\nFailed: ${description}`);
    throw error;
  }
}

function parseArgs(): { count: number } {
  const args = process.argv.slice(2);
  let count = 10; // default

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--count=')) {
      count = parseInt(arg.split('=')[1], 10);
    } else if (arg === '-n' || arg === '--count') {
      count = parseInt(args[i + 1], 10);
      i++;
    }
  }

  if (isNaN(count) || count < 1) {
    console.error('Invalid count. Usage: npm run pipeline -- --count=10');
    process.exit(1);
  }

  return { count };
}

function updateManifestWithR2Urls(): void {
  console.log('\nUpdating manifest with R2 URLs...');

  const r2ManifestPath = path.join(PROJECT_ROOT, 'data', 'r2-manifest.json');
  const manifestPath = path.join(PROJECT_ROOT, 'data', 'brutalismManifest.json');

  const r2Manifest = JSON.parse(fs.readFileSync(r2ManifestPath, 'utf-8'));
  const images = Object.keys(r2Manifest.entries)
    .map(key => `${R2_BASE_URL}/${key}`)
    .sort();

  fs.writeFileSync(manifestPath, JSON.stringify({ images }, null, 2));
  console.log(`Updated manifest with ${images.length} R2 URLs`);
}

function copyNewImages(): void {
  console.log('\nCopying new images to public/images...');

  const brutalFrameImages = path.join(PROJECT_ROOT, 'BrutalFrame', 'images');
  const publicImages = path.join(PROJECT_ROOT, 'public', 'images');

  // Ensure public/images exists
  if (!fs.existsSync(publicImages)) {
    fs.mkdirSync(publicImages, { recursive: true });
  }

  // Get list of shards in BrutalFrame
  const shards = fs.readdirSync(brutalFrameImages, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  let copied = 0;

  for (const shard of shards) {
    const srcDir = path.join(brutalFrameImages, shard);
    const destDir = path.join(publicImages, shard);

    // Ensure shard dir exists in public
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const files = fs.readdirSync(srcDir);
    for (const file of files) {
      const srcFile = path.join(srcDir, file);
      const destFile = path.join(destDir, file);

      // Only copy if not exists or different size
      if (!fs.existsSync(destFile)) {
        fs.copyFileSync(srcFile, destFile);
        copied++;
      } else {
        const srcStat = fs.statSync(srcFile);
        const destStat = fs.statSync(destFile);
        if (srcStat.size !== destStat.size) {
          fs.copyFileSync(srcFile, destFile);
          copied++;
        }
      }
    }
  }

  console.log(`Copied ${copied} new images to public/images`);
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  const { count } = parseArgs();

  console.log('='.repeat(60));
  console.log('BRUTALIST IMAGE GENERATION PIPELINE');
  console.log('='.repeat(60));
  console.log(`Generating ${count} new images...\n`);

  const startTime = Date.now();

  // Step 1: Generate new images
  run(
    `npx ts-node --project tsconfig.scripts.json scripts/generate-brutalism.ts --count=${count}`,
    `Generate ${count} new images`
  );

  // Step 2: Export to BrutalFrame (JPEG compression)
  run(
    'npx ts-node --project tsconfig.scripts.json scripts/export-tablet.ts',
    'Export to compressed JPEGs'
  );

  // Step 3: Copy new images to public/images
  copyNewImages();

  // Step 4: Upload to R2
  run(
    'npx ts-node --project tsconfig.scripts.json scripts/upload-r2.ts',
    'Upload new images to R2'
  );

  // Step 5: Update manifest with R2 URLs
  updateManifestWithR2Urls();

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log('PIPELINE COMPLETE');
  console.log('='.repeat(60));
  console.log(`Time elapsed: ${elapsed} minutes`);
  console.log(`\nTo deploy the updated manifest to Fly.io, run:`);
  console.log('  fly deploy');
}

main().catch((error) => {
  console.error('\nPipeline failed:', error.message);
  process.exit(1);
});
