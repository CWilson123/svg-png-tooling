#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadIconsConfig, loadSizesConfig } from './config.js';
import { scanIconsDirectory } from './scanner.js';
import { recolorSvg, RecolorResult } from './recolor.js';
import { composeSvg, ComposeResult } from './compose.js';
import { rasterizeIcons, writeManifest, formatFileSize, generateIconsTs } from './rasterize.js';
import { verifyBuild, formatVerifyResult } from './verify.js';
import { ValidationError, BuildPlanEntry, IconEntry, BackgroundShape, HexColor, ICON_CONFIG_DEFAULTS, IconsConfig, SizesConfig, DensityMode, DEFAULT_DENSITY_MODE } from './types.js';

// Resolve project root (where this CLI is run from)
const PROJECT_ROOT = process.cwd();
const ICONS_SRC_DIR = path.join(PROJECT_ROOT, 'icons-src');
const ICONS_DIST_DIR = path.join(PROJECT_ROOT, 'icons-dist');
const CONFIG_DIR = path.join(PROJECT_ROOT, 'config');
const BUILD_DIR = path.join(PROJECT_ROOT, '.build');
const RECOLORED_DIR = path.join(BUILD_DIR, 'recolored');
const COMPOSED_DIR = path.join(BUILD_DIR, 'composed');

/**
 * Parse command line arguments
 */
function parseArgs(): { clean: boolean } {
  const args = process.argv.slice(2);
  return {
    clean: args.includes('--clean'),
  };
}

/**
 * Clean build directories
 */
function cleanBuildDirs(): void {
  console.log('Cleaning build directories...');

  if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
    console.log(`  Removed ${path.relative(PROJECT_ROOT, BUILD_DIR)}/`);
  }

  if (fs.existsSync(ICONS_DIST_DIR)) {
    fs.rmSync(ICONS_DIST_DIR, { recursive: true, force: true });
    console.log(`  Removed ${path.relative(PROJECT_ROOT, ICONS_DIST_DIR)}/`);
  }

  console.log('');
}

/**
 * Format a validation error for display
 */
function formatError(error: ValidationError): string {
  const parts = [`[${error.type.toUpperCase()}]`, error.message];
  if (error.file) {
    parts.push(`\n  File: ${error.file}`);
  }
  return parts.join(' ');
}

/**
 * Generate build plan for dry-run output
 */
function generateBuildPlan(
  icons: IconEntry[],
  sizes: number[],
  densityMode: DensityMode
): BuildPlanEntry[] {
  const useSizeFolders = densityMode === 'size-folders' || densityMode === 'both';
  const useDensity = densityMode === 'density' || densityMode === 'both';

  return icons.map(icon => {
    const outputFiles: string[] = [];

    // Size folder outputs
    if (useSizeFolders) {
      for (const size of sizes) {
        outputFiles.push(path.join(ICONS_DIST_DIR, String(size), `${icon.key}.png`));
      }
    }

    // Density outputs
    if (useDensity) {
      outputFiles.push(path.join(ICONS_DIST_DIR, `${icon.key}.png`));     // 1x
      outputFiles.push(path.join(ICONS_DIST_DIR, `${icon.key}@2x.png`));  // 2x
      outputFiles.push(path.join(ICONS_DIST_DIR, `${icon.key}@3x.png`));  // 3x
    }

    return {
      iconKey: icon.key,
      svgPath: icon.svgPath,
      sizes,
      background: icon.config.background,
      shape: icon.config.shape ?? ICON_CONFIG_DEFAULTS.shape,
      padding: icon.config.padding ?? ICON_CONFIG_DEFAULTS.padding,
      layers: icon.config.layers,
      usingDefaults: icon.usingDefaults,
      outputFiles,
    };
  });
}

/**
 * Print build plan in a readable format
 */
function printBuildPlan(plan: BuildPlanEntry[]): void {
  console.log('\n' + '='.repeat(60));
  console.log('BUILD PLAN');
  console.log('='.repeat(60));

  if (plan.length === 0) {
    console.log('\nNo icons to process.');
    return;
  }

  console.log(`\nFound ${plan.length} icon(s) to process:\n`);

  for (const entry of plan) {
    console.log(`Icon: ${entry.iconKey}`);
    console.log(`  Source: ${entry.svgPath}`);
    console.log(`  Config: ${entry.usingDefaults ? 'defaults' : 'specific'}`);
    console.log(`  Background: ${entry.background}`);
    console.log(`  Shape: ${entry.shape}`);
    console.log(`  Padding: ${entry.padding}`);
    console.log(`  Layers:`);
    for (const [layer, color] of Object.entries(entry.layers)) {
      console.log(`    ${layer}: ${color}`);
    }
    console.log(`  Output sizes: ${entry.sizes.join(', ')}px`);
    console.log(`  Output files:`);
    for (const file of entry.outputFiles) {
      console.log(`    - ${path.relative(PROJECT_ROOT, file)}`);
    }
    console.log();
  }

  console.log('='.repeat(60));
  console.log(`Total: ${plan.length} icons × ${plan[0]?.sizes.length || 0} sizes = ${plan.length * (plan[0]?.sizes.length || 0)} PNG files to generate`);
  console.log('='.repeat(60) + '\n');
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
 * Process and recolor all icons
 */
function recolorIcons(icons: IconEntry[]): {
  results: RecolorResult[];
  semanticCount: number;
  fallbackCount: number;
  errorCount: number;
  allWarnings: { iconKey: string; warning: string }[];
  allErrors: { iconKey: string; error: string }[];
} {
  const results: RecolorResult[] = [];
  let semanticCount = 0;
  let fallbackCount = 0;
  let errorCount = 0;
  const allWarnings: { iconKey: string; warning: string }[] = [];
  const allErrors: { iconKey: string; error: string }[] = [];

  // Ensure output directory exists
  ensureDir(RECOLORED_DIR);

  for (const icon of icons) {
    // Read SVG content
    const svgContent = fs.readFileSync(icon.svgPath, 'utf-8');

    // Recolor the SVG
    const result = recolorSvg(svgContent, icon.key, icon.config);
    results.push(result);

    // Collect warnings and errors
    for (const warning of result.warnings) {
      allWarnings.push({ iconKey: icon.key, warning });
    }
    for (const error of result.errors) {
      allErrors.push({ iconKey: icon.key, error });
    }

    // Track counts
    if (result.errors.length > 0) {
      errorCount++;
    } else if (result.usedSemanticRecolor) {
      semanticCount++;
    } else {
      fallbackCount++;
    }

    // Write recolored SVG (only if no errors)
    if (result.errors.length === 0) {
      const outputPath = path.join(RECOLORED_DIR, `${icon.key}.svg`);
      fs.writeFileSync(outputPath, result.svgContent, 'utf-8');
    }
  }

  return { results, semanticCount, fallbackCount, errorCount, allWarnings, allErrors };
}

/**
 * Compose background shapes with recolored icons
 */
function composeIcons(
  icons: IconEntry[],
  recolorResults: RecolorResult[]
): {
  results: ComposeResult[];
  shapeCounts: Record<string, number>;
  errorCount: number;
  allErrors: { iconKey: string; error: string }[];
} {
  const results: ComposeResult[] = [];
  const shapeCounts: Record<string, number> = {};
  let errorCount = 0;
  const allErrors: { iconKey: string; error: string }[] = [];

  // Ensure output directory exists
  ensureDir(COMPOSED_DIR);

  // Create a map of recolor results by icon key
  const recolorMap = new Map(recolorResults.map(r => [r.iconKey, r]));

  for (const icon of icons) {
    const recolorResult = recolorMap.get(icon.key);

    // Skip if recoloring failed
    if (!recolorResult || recolorResult.errors.length > 0) {
      continue;
    }

    // Compose the SVG
    const result = composeSvg(recolorResult.svgContent, icon.key, icon.config);
    results.push(result);

    // Track shape counts
    shapeCounts[result.shape] = (shapeCounts[result.shape] || 0) + 1;

    // Collect errors
    for (const error of result.errors) {
      allErrors.push({ iconKey: icon.key, error });
    }

    if (result.errors.length > 0) {
      errorCount++;
    } else {
      // Write composed SVG
      const outputPath = path.join(COMPOSED_DIR, `${icon.key}.svg`);
      fs.writeFileSync(outputPath, result.svgContent, 'utf-8');
    }
  }

  return { results, shapeCounts, errorCount, allErrors };
}

/**
 * Print recoloring summary
 */
function printRecolorSummary(
  semanticCount: number,
  fallbackCount: number,
  errorCount: number,
  allWarnings: { iconKey: string; warning: string }[],
  allErrors: { iconKey: string; error: string }[]
): void {
  console.log('\n' + '='.repeat(60));
  console.log('RECOLORING SUMMARY');
  console.log('='.repeat(60));

  const total = semanticCount + fallbackCount + errorCount;
  console.log(`\nProcessed: ${total} icon(s)`);
  console.log(`  Semantic recolor: ${semanticCount}`);
  console.log(`  Fallback recolor: ${fallbackCount}`);
  console.log(`  Errors: ${errorCount}`);

  if (allWarnings.length > 0) {
    console.log('\nWarnings:');
    for (const { iconKey, warning } of allWarnings) {
      console.log(`  [${iconKey}] ${warning}`);
    }
  }

  if (allErrors.length > 0) {
    console.log('\nErrors:');
    for (const { iconKey, error } of allErrors) {
      console.error(`  [${iconKey}] ${error}`);
    }
  }

  console.log('\n' + '='.repeat(60));

  if (errorCount === 0) {
    console.log(`Recolored SVGs written to: ${path.relative(PROJECT_ROOT, RECOLORED_DIR)}/`);
  }

  console.log('='.repeat(60));
}

/**
 * Print composition summary
 */
function printComposeSummary(
  shapeCounts: Record<string, number>,
  errorCount: number,
  allErrors: { iconKey: string; error: string }[]
): void {
  console.log('\n' + '='.repeat(60));
  console.log('COMPOSITION SUMMARY');
  console.log('='.repeat(60));

  const total = Object.values(shapeCounts).reduce((a, b) => a + b, 0);
  console.log(`\nComposed: ${total} icon(s)`);
  console.log('  By shape:');
  for (const [shape, count] of Object.entries(shapeCounts).sort()) {
    console.log(`    ${shape}: ${count}`);
  }

  if (errorCount > 0) {
    console.log(`  Errors: ${errorCount}`);
  }

  if (allErrors.length > 0) {
    console.log('\nErrors:');
    for (const { iconKey, error } of allErrors) {
      console.error(`  [${iconKey}] ${error}`);
    }
  }

  console.log('\n' + '='.repeat(60));

  if (errorCount === 0) {
    console.log(`Composed SVGs written to: ${path.relative(PROJECT_ROOT, COMPOSED_DIR)}/`);
  }

  console.log('='.repeat(60));
}

/**
 * Print rasterization summary
 */
function printRasterizeSummary(
  totalFiles: number,
  totalSize: number,
  errorCount: number,
  sizes: number[],
  densityMode: DensityMode,
  errors: { iconKey: string; size: number; error: string }[]
): void {
  console.log('\n' + '='.repeat(60));
  console.log('RASTERIZATION SUMMARY');
  console.log('='.repeat(60));

  console.log(`\nGenerated: ${totalFiles} PNG file(s)`);
  console.log(`  Total size: ${formatFileSize(totalSize)}`);
  console.log(`  Average: ${formatFileSize(Math.round(totalSize / totalFiles))} per file`);
  console.log(`  Sizes: ${sizes.join(', ')}px`);
  console.log(`  Mode: ${densityMode}`);

  if (densityMode === 'density' || densityMode === 'both') {
    console.log(`  Density files: @1x (${sizes[0]}px), @2x (${sizes[1]}px), @3x (${sizes[2]}px)`);
  }

  if (errorCount > 0) {
    console.log(`  Errors: ${errorCount}`);
  }

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const { iconKey, size, error } of errors) {
      console.error(`  [${iconKey}@${size}px] ${error}`);
    }
  }

  console.log('\n' + '='.repeat(60));

  if (errorCount === 0) {
    console.log(`PNGs written to: ${path.relative(PROJECT_ROOT, ICONS_DIST_DIR)}/`);
    console.log(`Manifest written to: ${path.relative(PROJECT_ROOT, ICONS_DIST_DIR)}/manifest.json`);
  }

  console.log('='.repeat(60) + '\n');
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs();

  console.log('Icon Pipeline - Build\n');
  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log(`Icons source: ${ICONS_SRC_DIR}`);
  console.log(`Icons output: ${ICONS_DIST_DIR}`);
  console.log(`Config dir:   ${CONFIG_DIR}`);
  console.log(`Build dir:    ${BUILD_DIR}`);

  // Clean if requested
  if (args.clean) {
    console.log('');
    cleanBuildDirs();
  }

  const allErrors: ValidationError[] = [];

  // Load configurations
  console.log('\nLoading configurations...');

  const { config: iconsConfig, errors: iconsErrors } = loadIconsConfig(CONFIG_DIR);
  allErrors.push(...iconsErrors);

  const { config: sizesConfig, errors: sizesErrors } = loadSizesConfig(CONFIG_DIR);
  allErrors.push(...sizesErrors);

  // If config loading failed, exit early
  if (iconsErrors.some(e => e.type === 'missing_file' || e.type === 'parse_error') ||
      sizesErrors.some(e => e.type === 'missing_file' || e.type === 'parse_error')) {
    console.error('\nConfiguration errors:');
    for (const error of allErrors) {
      console.error(formatError(error));
    }
    process.exit(1);
  }

  console.log(`  Loaded icons.config.json (${Object.keys(iconsConfig.icons).length} icon definitions)`);
  const modeDisplay = sizesConfig.densityMode || 'size-folders';
  console.log(`  Loaded sizes.config.json (${sizesConfig.sizes.length} sizes: ${sizesConfig.sizes.join(', ')}px, mode: ${modeDisplay})`);

  // Scan icons directory
  console.log('\nScanning icons-src/ for SVG files...');
  const { icons, errors: scanErrors } = scanIconsDirectory(ICONS_SRC_DIR, iconsConfig);
  allErrors.push(...scanErrors);

  if (icons.length > 0) {
    console.log(`  Found ${icons.length} valid SVG file(s)`);
  }

  // Check for any validation errors
  if (allErrors.length > 0) {
    console.error('\nValidation errors:');
    for (const error of allErrors) {
      console.error(formatError(error));
    }
    console.error(`\n${allErrors.length} error(s) found. Please fix the issues above and try again.`);
    process.exit(1);
  }

  // Generate and print build plan
  const buildPlanDensityMode = sizesConfig.densityMode || DEFAULT_DENSITY_MODE;
  const buildPlan = generateBuildPlan(icons, sizesConfig.sizes, buildPlanDensityMode);
  printBuildPlan(buildPlan);

  // Step 1: Recolor icons
  console.log('Recoloring SVGs...');
  const recolorResult = recolorIcons(icons);

  // Print recoloring summary
  printRecolorSummary(
    recolorResult.semanticCount,
    recolorResult.fallbackCount,
    recolorResult.errorCount,
    recolorResult.allWarnings,
    recolorResult.allErrors
  );

  // Exit with error if any recoloring errors
  if (recolorResult.errorCount > 0) {
    console.error(`${recolorResult.errorCount} SVG(s) failed to recolor. Please fix the errors above.`);
    process.exit(1);
  }

  // Step 2: Compose with background shapes
  console.log('Composing with background shapes...');
  const composeResult = composeIcons(icons, recolorResult.results);

  // Print composition summary
  printComposeSummary(
    composeResult.shapeCounts,
    composeResult.errorCount,
    composeResult.allErrors
  );

  // Exit with error if any composition errors
  if (composeResult.errorCount > 0) {
    console.error(`${composeResult.errorCount} SVG(s) failed to compose. Please fix the errors above.`);
    process.exit(1);
  }

  // Step 3: Rasterize to PNG
  console.log('Rasterizing to PNG...');

  // Build icon configs map for manifest
  const iconConfigs = new Map<string, { shape: BackgroundShape; background: HexColor }>();
  for (const icon of icons) {
    iconConfigs.set(icon.key, {
      shape: icon.config.shape ?? ICON_CONFIG_DEFAULTS.shape,
      background: icon.config.background,
    });
  }

  // Ensure output directory exists
  ensureDir(ICONS_DIST_DIR);

  const densityMode = sizesConfig.densityMode || DEFAULT_DENSITY_MODE;
  const rasterResult = await rasterizeIcons(
    COMPOSED_DIR,
    ICONS_DIST_DIR,
    sizesConfig.sizes,
    iconConfigs,
    densityMode
  );

  // Collect rasterization errors
  const rasterErrors = rasterResult.results
    .filter(r => !r.success)
    .map(r => ({ iconKey: r.iconKey, size: r.size, error: r.error || 'Unknown error' }));

  // Print rasterization summary
  printRasterizeSummary(
    rasterResult.totalFiles,
    rasterResult.totalSize,
    rasterResult.errorCount,
    sizesConfig.sizes,
    densityMode,
    rasterErrors
  );

  // Exit with error if any rasterization errors
  if (rasterResult.errorCount > 0) {
    console.error(`${rasterResult.errorCount} PNG(s) failed to generate. Please fix the errors above.`);
    process.exit(1);
  }

  // Step 4: Write manifest
  writeManifest(ICONS_DIST_DIR, rasterResult.manifest);

  // Step 4b: Generate icons.ts for React Native (if density mode)
  if (densityMode === 'density' || densityMode === 'both') {
    const iconKeys = icons.map(icon => icon.key);
    generateIconsTs(ICONS_DIST_DIR, iconKeys);
    console.log(`Generated icons.ts for React Native imports`);
  }

  // Step 5: Verify build
  console.log('Verifying build...');
  const verifyResult = verifyBuild(
    ICONS_SRC_DIR,
    ICONS_DIST_DIR,
    iconsConfig,
    sizesConfig
  );

  console.log('\n' + formatVerifyResult(verifyResult));

  if (!verifyResult.success) {
    console.error('\nBuild verification failed. Please fix the errors above.');
    process.exit(1);
  }

  console.log('\nBuild complete!\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
