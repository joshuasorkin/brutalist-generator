/**
 * R2 Upload Script
 *
 * Uploads images from public/images to Cloudflare R2 with manifest tracking.
 * Only uploads images not already in the manifest (incremental uploads).
 *
 * Usage:
 *   npm run upload:r2
 *
 * Output:
 *   ./data/r2-manifest.json - tracks uploaded files
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ============================================================
// TYPES
// ============================================================

interface R2ManifestEntry {
  r2Key: string;
  localPath: string;
  size: number;
  uploadedAt: string;
}

interface R2Manifest {
  version: number;
  bucket: string;
  entries: Record<string, R2ManifestEntry>; // key = r2Key
  lastUploadAt?: string;
}

interface UploadResult {
  scanned: number;
  uploaded: number;
  skipped: number;
  failed: number;
  errors: Array<{ file: string; error: string }>;
}

// ============================================================
// CONFIG
// ============================================================

const BUCKET_NAME = 'brutalist-images';
const PROJECT_ROOT = path.resolve(__dirname, '..');
const IMAGES_DIR = path.join(PROJECT_ROOT, 'public', 'images');
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'data', 'r2-manifest.json');

// ============================================================
// HELPERS
// ============================================================

function loadManifest(): R2Manifest {
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      const content = fs.readFileSync(MANIFEST_PATH, 'utf-8');
      return JSON.parse(content);
    } catch {
      console.log('Could not parse existing manifest, starting fresh.');
    }
  }
  return { version: 1, bucket: BUCKET_NAME, entries: {} };
}

function saveManifest(manifest: R2Manifest): void {
  manifest.lastUploadAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function scanForImages(dir: string, basePath: string = ''): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(basePath, entry.name);

    if (entry.isDirectory()) {
      results.push(...scanForImages(fullPath, relativePath));
    } else if (entry.isFile() && /\.(jpg|jpeg|png|webp)$/i.test(entry.name)) {
      results.push(relativePath);
    }
  }

  return results;
}

function uploadToR2(localPath: string, r2Key: string): boolean {
  try {
    const cmd = `wrangler r2 object put "${BUCKET_NAME}/${r2Key}" --file="${localPath}" --content-type="image/jpeg" --remote`;
    execSync(cmd, { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('R2 Upload: Sync images to Cloudflare R2');
  console.log('='.repeat(60));
  console.log(`Bucket:   ${BUCKET_NAME}`);
  console.log(`Source:   ${IMAGES_DIR}`);
  console.log(`Manifest: ${MANIFEST_PATH}`);

  const manifest = loadManifest();

  // Scan for images
  console.log(`\nScanning for images in: ${IMAGES_DIR}`);
  const imageFiles = scanForImages(IMAGES_DIR);
  console.log(`Found ${imageFiles.length} image file(s)\n`);

  if (imageFiles.length === 0) {
    console.log('No images found. Nothing to upload.');
    return;
  }

  const result: UploadResult = {
    scanned: imageFiles.length,
    uploaded: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const relativePath of imageFiles) {
    // Normalize to forward slashes for R2 key
    const r2Key = 'images/' + relativePath.split(path.sep).join('/');
    const localFullPath = path.join(IMAGES_DIR, relativePath);

    // Check if already uploaded
    if (manifest.entries[r2Key]) {
      const existing = manifest.entries[r2Key];
      const stats = fs.statSync(localFullPath);

      // Skip if same size (simple check)
      if (existing.size === stats.size) {
        result.skipped++;
        continue;
      }
    }

    // Upload
    console.log(`Uploading: ${r2Key}`);
    const success = uploadToR2(localFullPath, r2Key);

    if (success) {
      const stats = fs.statSync(localFullPath);
      manifest.entries[r2Key] = {
        r2Key,
        localPath: relativePath,
        size: stats.size,
        uploadedAt: new Date().toISOString(),
      };
      result.uploaded++;
      console.log(`  ✓ Uploaded`);
    } else {
      result.failed++;
      result.errors.push({ file: r2Key, error: 'Upload failed' });
      console.log(`  ✗ Failed`);
    }

    // Save manifest periodically (every 10 uploads)
    if (result.uploaded % 10 === 0) {
      saveManifest(manifest);
    }
  }

  // Final save
  saveManifest(manifest);

  console.log('\n' + '='.repeat(60));
  console.log('Upload Summary');
  console.log('='.repeat(60));
  console.log(`Scanned:  ${result.scanned}`);
  console.log(`Uploaded: ${result.uploaded}`);
  console.log(`Skipped:  ${result.skipped}`);
  console.log(`Failed:   ${result.failed}`);

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    for (const { file, error } of result.errors) {
      console.log(`  - ${file}: ${error}`);
    }
  }

  console.log(`\nManifest saved to: ${MANIFEST_PATH}`);

  // Show public URL info
  console.log('\n' + '='.repeat(60));
  console.log('Next Steps');
  console.log('='.repeat(60));
  console.log('To make images publicly accessible, enable public access:');
  console.log('  1. Go to Cloudflare Dashboard > R2 > brutalist-images');
  console.log('  2. Settings > Public access > Allow Access');
  console.log('  3. Note your public bucket URL (e.g., https://pub-xxx.r2.dev)');

  if (result.failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
