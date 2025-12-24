/**
 * Tablet Export Script
 *
 * Converts PNG masters from public/brutalism to a tablet-ready JPEG library
 * with deterministic sharding and idempotent "skip if unchanged" behavior.
 *
 * Usage:
 *   npm run export:tablet
 *
 * Output:
 *   ./BrutalFrame/images/<shard>/<filename>.jpg
 *   ./BrutalFrame/export-manifest.json
 *
 * The manifest tracks source file metadata (size, mtime) to skip unchanged files.
 * Re-running is safe and will only re-export modified sources.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';

// ============================================================
// TYPES
// ============================================================

interface ExportOptions {
  inputDir: string;
  outputDir: string;
  quality?: number;
  concurrency?: number;
}

interface ManifestEntry {
  outputPath: string; // relative to BrutalFrame root, e.g., "images/3f/brutalism_0001.jpg"
  sourceSize: number;
  sourceMtimeMs: number;
}

interface ExportManifest {
  version: number;
  exportedAt?: string;
  entries: Record<string, ManifestEntry>; // key = relative source path from input root
}

interface ExportResult {
  scanned: number;
  exported: number;
  skipped: number;
  failed: number;
  errors: Array<{ file: string; error: string }>;
}

// ============================================================
// CONCURRENCY LIMITER (simple p-limit implementation)
// ============================================================

function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (queue.length > 0 && active < concurrency) {
      const fn = queue.shift()!;
      fn();
    }
  };

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const run = async () => {
        active++;
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          active--;
          next();
        }
      };

      if (active < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Compute SHA1 hash of a string, return hex
 */
function sha1(input: string): string {
  return crypto.createHash('sha1').update(input).digest('hex');
}

/**
 * Get 2-char shard prefix from relative path hash
 */
function getShardPrefix(relativePath: string): string {
  const hash = sha1(relativePath);
  return hash.substring(0, 2);
}

/**
 * Recursively scan directory for PNG files
 */
function scanForPngs(dir: string, basePath: string = ''): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(basePath, entry.name);

    if (entry.isDirectory()) {
      results.push(...scanForPngs(fullPath, relativePath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
      results.push(relativePath);
    }
  }

  return results;
}

/**
 * Load manifest from disk or return empty manifest
 */
function loadManifest(manifestPath: string): ExportManifest {
  if (fs.existsSync(manifestPath)) {
    try {
      const content = fs.readFileSync(manifestPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      console.log('Could not parse existing manifest, starting fresh.');
    }
  }
  return { version: 1, entries: {} };
}

/**
 * Save manifest to disk
 */
function saveManifest(manifestPath: string, manifest: ExportManifest): void {
  manifest.exportedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * Ensure directory exists
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Normalize path separators to forward slashes for consistent manifest keys
 */
function normalizeKey(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

// ============================================================
// MAIN EXPORT FUNCTION
// ============================================================

export async function exportTabletLibrary(options: ExportOptions): Promise<ExportResult> {
  const {
    inputDir,
    outputDir,
    quality = 90,
    concurrency = 6,
  } = options;

  const imagesDir = path.join(outputDir, 'images');
  const manifestPath = path.join(outputDir, 'export-manifest.json');

  // Ensure output directories exist
  ensureDir(outputDir);
  ensureDir(imagesDir);

  // Load existing manifest
  const manifest = loadManifest(manifestPath);

  // Scan for PNG files
  console.log(`\nScanning for PNG files in: ${inputDir}`);
  const pngFiles = scanForPngs(inputDir);
  console.log(`Found ${pngFiles.length} PNG file(s)\n`);

  if (pngFiles.length === 0) {
    console.log('No PNG files found. Nothing to export.');
    return { scanned: 0, exported: 0, skipped: 0, failed: 0, errors: [] };
  }

  const result: ExportResult = {
    scanned: pngFiles.length,
    exported: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  // Build a map of output paths to detect collisions
  const outputPathMap = new Map<string, string[]>(); // outputPath -> [sourceKeys]

  // First pass: compute all output paths to detect collisions
  for (const relativePath of pngFiles) {
    const key = normalizeKey(relativePath);
    const shard = getShardPrefix(key);
    const baseName = path.basename(relativePath, '.png') + '.jpg';
    const outputRelPath = `images/${shard}/${baseName}`;

    if (!outputPathMap.has(outputRelPath)) {
      outputPathMap.set(outputRelPath, []);
    }
    outputPathMap.get(outputRelPath)!.push(key);
  }

  // Build final output path mapping, handling collisions
  const finalOutputPaths = new Map<string, string>(); // sourceKey -> final output relative path

  for (const [outputRelPath, sourceKeys] of outputPathMap) {
    if (sourceKeys.length === 1) {
      // No collision
      finalOutputPaths.set(sourceKeys[0], outputRelPath);
    } else {
      // Collision: disambiguate with hash suffix
      for (const sourceKey of sourceKeys) {
        const hash = sha1(sourceKey).substring(0, 8);
        const dir = path.dirname(outputRelPath);
        const ext = path.extname(outputRelPath);
        const base = path.basename(outputRelPath, ext);
        const disambiguated = `${dir}/${base}-${hash}${ext}`;
        finalOutputPaths.set(sourceKey, disambiguated);
      }
    }
  }

  // Create concurrency limiter
  const limit = createLimiter(concurrency);

  // Process files with limited concurrency
  const processFile = async (relativePath: string): Promise<void> => {
    const key = normalizeKey(relativePath);
    const sourcePath = path.join(inputDir, relativePath);
    const outputRelPath = finalOutputPaths.get(key)!;
    const outputFullPath = path.join(outputDir, outputRelPath);

    try {
      // Get source file stats
      const stats = fs.statSync(sourcePath);
      const sourceSize = stats.size;
      const sourceMtimeMs = stats.mtimeMs;

      // Check if we can skip
      const existing = manifest.entries[key];
      if (existing) {
        if (
          existing.sourceSize === sourceSize &&
          existing.sourceMtimeMs === sourceMtimeMs &&
          existing.outputPath === outputRelPath &&
          fs.existsSync(outputFullPath)
        ) {
          result.skipped++;
          return;
        }
      }

      // Ensure shard directory exists
      const shardDir = path.dirname(outputFullPath);
      ensureDir(shardDir);

      // Convert PNG to JPEG using sharp
      await sharp(sourcePath)
        .jpeg({
          quality,
          progressive: true,
          mozjpeg: true, // Better compression, strips metadata
        })
        .toFile(outputFullPath);

      // Update manifest entry
      manifest.entries[key] = {
        outputPath: outputRelPath,
        sourceSize,
        sourceMtimeMs,
      };

      result.exported++;
      console.log(`Exported: ${key} -> ${outputRelPath}`);
    } catch (err) {
      result.failed++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      result.errors.push({ file: key, error: errorMsg });
      console.error(`Failed: ${key} - ${errorMsg}`);
    }
  };

  // Process all files with concurrency limit
  const promises = pngFiles.map((relativePath) =>
    limit(() => processFile(relativePath))
  );

  await Promise.all(promises);

  // Save updated manifest
  saveManifest(manifestPath, manifest);

  return result;
}

// ============================================================
// CLI ENTRYPOINT
// ============================================================

async function main(): Promise<void> {
  // Get project root (one level up from scripts/)
  const projectRoot = path.resolve(__dirname, '..');
  const inputDir = path.join(projectRoot, 'public', 'brutalism');
  const outputDir = path.join(projectRoot, 'BrutalFrame');

  console.log('='.repeat(60));
  console.log('Tablet Export: PNG -> JPEG Conversion');
  console.log('='.repeat(60));
  console.log(`Input:  ${inputDir}`);
  console.log(`Output: ${outputDir}`);

  const result = await exportTabletLibrary({
    inputDir,
    outputDir,
    quality: 90,
    concurrency: 6,
  });

  console.log('\n' + '='.repeat(60));
  console.log('Export Summary');
  console.log('='.repeat(60));
  console.log(`Scanned:  ${result.scanned}`);
  console.log(`Exported: ${result.exported}`);
  console.log(`Skipped:  ${result.skipped}`);
  console.log(`Failed:   ${result.failed}`);

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    for (const { file, error } of result.errors) {
      console.log(`  - ${file}: ${error}`);
    }
  }

  console.log(`\nManifest: ${path.join(outputDir, 'export-manifest.json')}`);
  console.log(`Images:   ${path.join(outputDir, 'images', '<shard>', '*.jpg')}`);

  if (result.failed > 0) {
    process.exit(1);
  }
}

// Run if executed directly
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
