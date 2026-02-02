import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  IconsConfig,
  IconEntry,
  ValidationError,
  ICON_KEY_PATTERN,
} from './types.js';

/**
 * Derive icon key from SVG filename
 */
function getIconKeyFromFilename(filename: string): string {
  return path.basename(filename, '.svg');
}

/**
 * Scan icons-src directory for SVG files and validate them
 */
export function scanIconsDirectory(
  iconsSrcDir: string,
  iconsConfig: IconsConfig
): { icons: IconEntry[]; errors: ValidationError[] } {
  const icons: IconEntry[] = [];
  const errors: ValidationError[] = [];

  if (!fs.existsSync(iconsSrcDir)) {
    errors.push({
      type: 'missing_file',
      message: `Icons source directory not found: ${iconsSrcDir}`,
      file: iconsSrcDir,
    });
    return { icons, errors };
  }

  const files = fs.readdirSync(iconsSrcDir);
  const svgFiles = files.filter(f => f.toLowerCase().endsWith('.svg'));

  if (svgFiles.length === 0) {
    console.log('Warning: No SVG files found in icons-src/');
    return { icons, errors };
  }

  for (const file of svgFiles) {
    const iconKey = getIconKeyFromFilename(file);
    const svgPath = path.join(iconsSrcDir, file);

    // Validate icon key format
    if (!ICON_KEY_PATTERN.test(iconKey)) {
      errors.push({
        type: 'invalid_filename',
        message: `Invalid icon filename "${file}": derived key "${iconKey}" must be lowercase alphanumeric and underscores only. Rename to match pattern: [a-z0-9_]+.svg`,
        file: svgPath,
        iconKey,
      });
      continue;
    }

    // Get config (specific or defaults)
    const specificConfig = iconsConfig.icons[iconKey];
    const config = specificConfig || iconsConfig.defaults;
    const usingDefaults = !specificConfig;

    icons.push({
      key: iconKey,
      svgPath,
      config,
      usingDefaults,
    });
  }

  return { icons, errors };
}
