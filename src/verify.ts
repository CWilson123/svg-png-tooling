import * as fs from 'node:fs';
import * as path from 'node:path';
import { IconsConfig, SizesConfig, ICON_KEY_PATTERN, DensityMode, DEFAULT_DENSITY_MODE } from './types.js';
import { Manifest } from './rasterize.js';

export interface VerifyError {
  type: 'missing_svg' | 'missing_png' | 'size_exceeded' | 'manifest_mismatch' | 'orphan_svg';
  message: string;
  file?: string;
  iconKey?: string;
}

export interface VerifyResult {
  success: boolean;
  errors: VerifyError[];
  warnings: string[];
  stats: {
    iconsInConfig: number;
    svgsInSrc: number;
    pngsGenerated: number;
    totalPngSize: number;
    largestPng: { file: string; size: number } | null;
  };
}

/** Default max PNG size in bytes (50KB) */
const DEFAULT_MAX_PNG_SIZE = 50 * 1024;

/**
 * Verify the build output
 */
export function verifyBuild(
  iconsSrcDir: string,
  iconsDistDir: string,
  iconsConfig: IconsConfig,
  sizesConfig: SizesConfig,
  maxPngSize: number = DEFAULT_MAX_PNG_SIZE
): VerifyResult {
  const errors: VerifyError[] = [];
  const warnings: string[] = [];
  const stats = {
    iconsInConfig: 0,
    svgsInSrc: 0,
    pngsGenerated: 0,
    totalPngSize: 0,
    largestPng: null as { file: string; size: number } | null,
  };

  // Get all icon keys from config (including defaults implies all SVGs should be processed)
  const configIconKeys = new Set(Object.keys(iconsConfig.icons));
  stats.iconsInConfig = configIconKeys.size;

  // Get all SVG files in icons-src
  const svgFiles: string[] = [];
  if (fs.existsSync(iconsSrcDir)) {
    const files = fs.readdirSync(iconsSrcDir);
    for (const file of files) {
      if (file.toLowerCase().endsWith('.svg')) {
        const iconKey = path.basename(file, '.svg');
        if (ICON_KEY_PATTERN.test(iconKey)) {
          svgFiles.push(iconKey);
        }
      }
    }
  }
  stats.svgsInSrc = svgFiles.length;

  // Check 1: Every icon key in config has a corresponding SVG
  for (const iconKey of configIconKeys) {
    if (!svgFiles.includes(iconKey)) {
      errors.push({
        type: 'missing_svg',
        message: `Icon "${iconKey}" is defined in config but no SVG file exists`,
        iconKey,
        file: path.join(iconsSrcDir, `${iconKey}.svg`),
      });
    }
  }

  // Check for orphan SVGs (SVGs without config - these use defaults, just warn)
  for (const iconKey of svgFiles) {
    if (!configIconKeys.has(iconKey)) {
      warnings.push(`SVG "${iconKey}.svg" has no explicit config (using defaults)`);
    }
  }

  // Load manifest
  const manifestPath = path.join(iconsDistDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    errors.push({
      type: 'manifest_mismatch',
      message: 'manifest.json not found in icons-dist/',
      file: manifestPath,
    });
    return { success: false, errors, warnings, stats };
  }

  let manifest: Manifest;
  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    manifest = JSON.parse(content);
  } catch (err) {
    errors.push({
      type: 'manifest_mismatch',
      message: `Failed to parse manifest.json: ${err instanceof Error ? err.message : String(err)}`,
      file: manifestPath,
    });
    return { success: false, errors, warnings, stats };
  }

  // Check 2: Every SVG produced PNGs for all configured sizes/densities
  const expectedSizes = sizesConfig.sizes;
  const densityMode = sizesConfig.densityMode || DEFAULT_DENSITY_MODE;
  const useSizeFolders = densityMode === 'size-folders' || densityMode === 'both';
  const useDensity = densityMode === 'density' || densityMode === 'both';
  const manifestIconKeys = new Set(Object.keys(manifest.icons));

  for (const iconKey of svgFiles) {
    // Check icon is in manifest
    if (!manifestIconKeys.has(iconKey)) {
      errors.push({
        type: 'manifest_mismatch',
        message: `SVG "${iconKey}.svg" is not in manifest`,
        iconKey,
      });
      continue;
    }

    const iconManifest = manifest.icons[iconKey];

    // Check all sizes exist (for size-folders or both mode)
    if (useSizeFolders) {
      for (const size of expectedSizes) {
        const expectedFile = iconManifest.files[String(size)];
        if (!expectedFile) {
          errors.push({
            type: 'missing_png',
            message: `Missing ${size}px PNG for "${iconKey}" in manifest`,
            iconKey,
          });
          continue;
        }

        const pngPath = path.join(iconsDistDir, expectedFile);
        if (!fs.existsSync(pngPath)) {
          errors.push({
            type: 'missing_png',
            message: `PNG file not found: ${expectedFile}`,
            iconKey,
            file: pngPath,
          });
          continue;
        }

        // Check file size
        const pngStats = fs.statSync(pngPath);
        stats.pngsGenerated++;
        stats.totalPngSize += pngStats.size;

        if (!stats.largestPng || pngStats.size > stats.largestPng.size) {
          stats.largestPng = { file: expectedFile, size: pngStats.size };
        }

        // Check 3: No PNG exceeds threshold
        if (pngStats.size > maxPngSize) {
          errors.push({
            type: 'size_exceeded',
            message: `PNG exceeds ${(maxPngSize / 1024).toFixed(0)}KB limit: ${expectedFile} (${(pngStats.size / 1024).toFixed(1)}KB)`,
            iconKey,
            file: pngPath,
          });
        }
      }
    }

    // Check density files exist (for density or both mode)
    if (useDensity) {
      if (!iconManifest.densityFiles) {
        errors.push({
          type: 'manifest_mismatch',
          message: `Missing densityFiles for "${iconKey}" in manifest`,
          iconKey,
        });
      } else {
        const densityKeys = ['1x', '2x', '3x'] as const;
        for (let i = 0; i < densityKeys.length; i++) {
          const densityKey = densityKeys[i];
          const expectedFile = iconManifest.densityFiles[densityKey];
          if (!expectedFile) {
            errors.push({
              type: 'missing_png',
              message: `Missing ${densityKey} density PNG for "${iconKey}" in manifest`,
              iconKey,
            });
            continue;
          }

          const pngPath = path.join(iconsDistDir, expectedFile);
          if (!fs.existsSync(pngPath)) {
            errors.push({
              type: 'missing_png',
              message: `Density PNG file not found: ${expectedFile}`,
              iconKey,
              file: pngPath,
            });
            continue;
          }

          // Check file size
          const pngStats = fs.statSync(pngPath);
          stats.pngsGenerated++;
          stats.totalPngSize += pngStats.size;

          if (!stats.largestPng || pngStats.size > stats.largestPng.size) {
            stats.largestPng = { file: expectedFile, size: pngStats.size };
          }

          // Check: No PNG exceeds threshold
          if (pngStats.size > maxPngSize) {
            errors.push({
              type: 'size_exceeded',
              message: `PNG exceeds ${(maxPngSize / 1024).toFixed(0)}KB limit: ${expectedFile} (${(pngStats.size / 1024).toFixed(1)}KB)`,
              iconKey,
              file: pngPath,
            });
          }
        }
      }
    }
  }

  // Check icons.ts exists when using density mode
  if (useDensity) {
    const iconsTsPath = path.join(iconsDistDir, 'icons.ts');
    if (!fs.existsSync(iconsTsPath)) {
      errors.push({
        type: 'manifest_mismatch',
        message: 'icons.ts not found in icons-dist/ (required for density mode)',
        file: iconsTsPath,
      });
    }
  }

  // Check 4: Manifest is consistent with files on disk
  // Check for extra icons in manifest that don't have SVGs
  for (const iconKey of manifestIconKeys) {
    if (!svgFiles.includes(iconKey)) {
      errors.push({
        type: 'manifest_mismatch',
        message: `Icon "${iconKey}" is in manifest but no SVG exists`,
        iconKey,
      });
    }
  }

  // Check manifest sizes match config
  const manifestSizes = new Set(manifest.sizes);
  for (const size of expectedSizes) {
    if (!manifestSizes.has(size)) {
      errors.push({
        type: 'manifest_mismatch',
        message: `Size ${size}px is in config but not in manifest`,
      });
    }
  }
  for (const size of manifestSizes) {
    if (!expectedSizes.includes(size)) {
      errors.push({
        type: 'manifest_mismatch',
        message: `Size ${size}px is in manifest but not in config`,
      });
    }
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}

/**
 * Format verification result for display
 */
export function formatVerifyResult(result: VerifyResult): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('VERIFICATION RESULTS');
  lines.push('='.repeat(60));
  lines.push('');

  lines.push('Stats:');
  lines.push(`  Icons in config: ${result.stats.iconsInConfig}`);
  lines.push(`  SVGs in icons-src: ${result.stats.svgsInSrc}`);
  lines.push(`  PNGs generated: ${result.stats.pngsGenerated}`);
  lines.push(`  Total PNG size: ${(result.stats.totalPngSize / 1024).toFixed(1)} KB`);
  if (result.stats.largestPng) {
    lines.push(`  Largest PNG: ${result.stats.largestPng.file} (${(result.stats.largestPng.size / 1024).toFixed(1)} KB)`);
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  if (result.errors.length > 0) {
    lines.push('');
    lines.push('Errors:');
    for (const error of result.errors) {
      lines.push(`  [${error.type.toUpperCase()}] ${error.message}`);
      if (error.file) {
        lines.push(`    File: ${error.file}`);
      }
    }
  }

  lines.push('');
  lines.push('='.repeat(60));
  lines.push(result.success ? 'VERIFICATION PASSED' : 'VERIFICATION FAILED');
  lines.push('='.repeat(60));

  return lines.join('\n');
}
