import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
import { BackgroundShape, HexColor, DensityMode, DEFAULT_DENSITY_MODE } from './types.js';

export interface RasterizeResult {
  iconKey: string;
  size: number;
  density?: number; // 1, 2, or 3 for density mode
  outputPath: string;
  fileSize: number;
  success: boolean;
  error?: string;
}

export interface ManifestIcon {
  shape: BackgroundShape;
  background: HexColor;
  files: Record<string, string>;
  densityFiles?: {
    '1x': string;
    '2x': string;
    '3x': string;
  };
}

export interface Manifest {
  generatedAt: string;
  densityMode: DensityMode;
  sizes: number[];
  baseSize?: number; // Base size for density mode (1x size)
  icons: Record<string, ManifestIcon>;
}

/**
 * Rasterize a single SVG to PNG at a specific size
 */
async function rasterizeSvg(
  svgPath: string,
  outputPath: string,
  size: number
): Promise<{ success: boolean; fileSize: number; error?: string }> {
  try {
    // Read SVG content
    const svgBuffer = fs.readFileSync(svgPath);

    // Rasterize with sharp
    await sharp(svgBuffer, { density: 300 })
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({
        compressionLevel: 9, // Maximum compression
        adaptiveFiltering: true,
        palette: false, // Keep full color for quality
      })
      .toFile(outputPath);

    // Get file size
    const stats = fs.statSync(outputPath);

    return { success: true, fileSize: stats.size };
  } catch (err) {
    return {
      success: false,
      fileSize: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
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
 * Get density suffix for a given density multiplier
 */
function getDensitySuffix(density: number): string {
  if (density === 1) return '';
  return `@${density}x`;
}

/**
 * Rasterize all composed SVGs to PNGs at all sizes
 */
export async function rasterizeIcons(
  composedDir: string,
  outputDir: string,
  sizes: number[],
  iconConfigs: Map<string, { shape: BackgroundShape; background: HexColor }>,
  densityMode: DensityMode = DEFAULT_DENSITY_MODE
): Promise<{
  results: RasterizeResult[];
  totalFiles: number;
  totalSize: number;
  errorCount: number;
  manifest: Manifest;
}> {
  const results: RasterizeResult[] = [];
  let totalFiles = 0;
  let totalSize = 0;
  let errorCount = 0;

  const useSizeFolders = densityMode === 'size-folders' || densityMode === 'both';
  const useDensity = densityMode === 'density' || densityMode === 'both';

  // Initialize manifest
  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    densityMode,
    sizes: [...sizes].sort((a, b) => a - b),
    icons: {},
  };

  // For density mode, first size is 1x base
  if (useDensity) {
    manifest.baseSize = sizes[0];
  }

  // Create size directories (for size-folders or both mode)
  if (useSizeFolders) {
    for (const size of sizes) {
      ensureDir(path.join(outputDir, String(size)));
    }
  }

  // Get all composed SVGs
  const composedFiles = fs.readdirSync(composedDir).filter(f => f.endsWith('.svg'));

  // Process each icon
  for (const svgFile of composedFiles) {
    const iconKey = path.basename(svgFile, '.svg');
    const svgPath = path.join(composedDir, svgFile);

    // Get icon config for manifest
    const iconConfig = iconConfigs.get(iconKey);
    if (iconConfig) {
      manifest.icons[iconKey] = {
        shape: iconConfig.shape,
        background: iconConfig.background,
        files: {},
      };

      if (useDensity) {
        manifest.icons[iconKey].densityFiles = {
          '1x': `${iconKey}.png`,
          '2x': `${iconKey}@2x.png`,
          '3x': `${iconKey}@3x.png`,
        };
      }
    }

    // Rasterize at each size
    for (let i = 0; i < sizes.length; i++) {
      const size = sizes[i];
      const density = i + 1; // 1x, 2x, 3x

      // Size folder output (for size-folders or both mode)
      if (useSizeFolders) {
        const outputPath = path.join(outputDir, String(size), `${iconKey}.png`);
        const relativePath = `${size}/${iconKey}.png`;

        const result = await rasterizeSvg(svgPath, outputPath, size);

        results.push({
          iconKey,
          size,
          outputPath,
          fileSize: result.fileSize,
          success: result.success,
          error: result.error,
        });

        if (result.success) {
          totalFiles++;
          totalSize += result.fileSize;

          // Add to manifest
          if (manifest.icons[iconKey]) {
            manifest.icons[iconKey].files[String(size)] = relativePath;
          }
        } else {
          errorCount++;
        }
      }

      // Density output (for density or both mode)
      if (useDensity) {
        const suffix = getDensitySuffix(density);
        const densityFileName = `${iconKey}${suffix}.png`;
        const outputPath = path.join(outputDir, densityFileName);
        const relativePath = densityFileName;

        const result = await rasterizeSvg(svgPath, outputPath, size);

        results.push({
          iconKey,
          size,
          density,
          outputPath,
          fileSize: result.fileSize,
          success: result.success,
          error: result.error,
        });

        if (result.success) {
          totalFiles++;
          totalSize += result.fileSize;
        } else {
          errorCount++;
        }
      }
    }
  }

  return { results, totalFiles, totalSize, errorCount, manifest };
}

/**
 * Write manifest file
 */
export function writeManifest(outputDir: string, manifest: Manifest): void {
  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * Generate icons.ts file for React Native imports
 * This file exports all icons with proper require() statements for RN asset resolution
 */
export function generateIconsTs(outputDir: string, iconKeys: string[]): void {
  const sortedKeys = [...iconKeys].sort();

  const lines: string[] = [
    '// Auto-generated by icon-pipeline',
    '// DO NOT EDIT MANUALLY',
    '',
    'export const icons = {',
  ];

  for (const key of sortedKeys) {
    // React Native requires the @Nx suffix files to be co-located
    // and only requires the base (1x) file - RN handles density automatically
    lines.push(`  ${key}: require('./${key}.png'),`);
  }

  lines.push('} as const;');
  lines.push('');
  lines.push('export type IconName = keyof typeof icons;');
  lines.push('');

  const content = lines.join('\n');
  const outputPath = path.join(outputDir, 'icons.ts');
  fs.writeFileSync(outputPath, content, 'utf-8');
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
