import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  IconsConfig,
  IconConfig,
  SizesConfig,
  ValidationError,
  BackgroundShape,
  DensityMode,
  ICON_KEY_PATTERN,
  HEX_COLOR_PATTERN,
} from './types.js';

const VALID_SHAPES: BackgroundShape[] = ['circle', 'rounded-square', 'square', 'none'];
const VALID_DENSITY_MODES: DensityMode[] = ['size-folders', 'density', 'both'];

/**
 * Load and parse a JSON config file
 */
function loadJsonFile<T>(filePath: string): T | ValidationError {
  if (!fs.existsSync(filePath)) {
    return {
      type: 'missing_file',
      message: `Config file not found: ${filePath}`,
      file: filePath,
    };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (err) {
    return {
      type: 'parse_error',
      message: `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
      file: filePath,
    };
  }
}

/**
 * Validate hex color format
 */
function isValidHexColor(color: string): boolean {
  return HEX_COLOR_PATTERN.test(color);
}

/**
 * Validate shape value
 */
function isValidShape(shape: unknown): shape is BackgroundShape {
  return typeof shape === 'string' && VALID_SHAPES.includes(shape as BackgroundShape);
}

/**
 * Validate padding value
 */
function isValidPadding(padding: unknown): padding is number {
  return typeof padding === 'number' && padding >= 0 && padding <= 1;
}

/**
 * Validate a single icon config's shape and padding
 */
function validateIconConfigShapeAndPadding(
  iconConfig: IconConfig,
  iconKey: string | null,
  errors: ValidationError[]
): void {
  // Validate shape if provided
  if (iconConfig.shape !== undefined && !isValidShape(iconConfig.shape)) {
    const keyInfo = iconKey ? ` for icon "${iconKey}"` : ' in defaults';
    errors.push({
      type: 'invalid_config',
      message: `Invalid shape "${iconConfig.shape}"${keyInfo}: must be one of ${VALID_SHAPES.join(', ')}`,
      iconKey: iconKey ?? undefined,
    });
  }

  // Validate padding if provided
  if (iconConfig.padding !== undefined && !isValidPadding(iconConfig.padding)) {
    const keyInfo = iconKey ? ` for icon "${iconKey}"` : ' in defaults';
    errors.push({
      type: 'invalid_config',
      message: `Invalid padding "${iconConfig.padding}"${keyInfo}: must be a number between 0 and 1`,
      iconKey: iconKey ?? undefined,
    });
  }
}

/**
 * Validate icons configuration
 */
export function validateIconsConfig(config: IconsConfig): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate icon keys
  for (const key of Object.keys(config.icons)) {
    if (!ICON_KEY_PATTERN.test(key)) {
      errors.push({
        type: 'invalid_config',
        message: `Invalid icon key "${key}": must be lowercase alphanumeric and underscores only`,
        iconKey: key,
      });
    }

    const iconConfig = config.icons[key];

    // Validate background color
    if (!isValidHexColor(iconConfig.background)) {
      errors.push({
        type: 'invalid_config',
        message: `Invalid background color "${iconConfig.background}" for icon "${key}": must be #RRGGBB format`,
        iconKey: key,
      });
    }

    // Validate layer colors
    for (const [layerKey, color] of Object.entries(iconConfig.layers)) {
      if (!isValidHexColor(color)) {
        errors.push({
          type: 'invalid_config',
          message: `Invalid layer color "${color}" for layer "${layerKey}" in icon "${key}": must be #RRGGBB format`,
          iconKey: key,
        });
      }
    }

    // Validate shape and padding
    validateIconConfigShapeAndPadding(iconConfig, key, errors);
  }

  // Validate defaults
  if (!isValidHexColor(config.defaults.background)) {
    errors.push({
      type: 'invalid_config',
      message: `Invalid default background color "${config.defaults.background}": must be #RRGGBB format`,
    });
  }

  for (const [layerKey, color] of Object.entries(config.defaults.layers)) {
    if (!isValidHexColor(color)) {
      errors.push({
        type: 'invalid_config',
        message: `Invalid default layer color "${color}" for layer "${layerKey}": must be #RRGGBB format`,
      });
    }
  }

  // Validate defaults shape and padding
  validateIconConfigShapeAndPadding(config.defaults, null, errors);

  return errors;
}

/**
 * Validate sizes configuration
 */
export function validateSizesConfig(config: SizesConfig): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate densityMode if provided
  if (config.densityMode !== undefined &&
      !VALID_DENSITY_MODES.includes(config.densityMode)) {
    errors.push({
      type: 'invalid_config',
      message: `Invalid densityMode "${config.densityMode}": must be one of ${VALID_DENSITY_MODES.join(', ')}`,
    });
  }

  if (!Array.isArray(config.sizes)) {
    errors.push({
      type: 'invalid_config',
      message: 'sizes must be an array',
    });
    return errors;
  }

  if (config.sizes.length === 0) {
    errors.push({
      type: 'invalid_config',
      message: 'sizes array must contain at least one size',
    });
  }

  // For density mode, we need exactly 3 sizes (1x, 2x, 3x)
  const mode = config.densityMode || 'size-folders';
  if ((mode === 'density' || mode === 'both') && config.sizes.length !== 3) {
    errors.push({
      type: 'invalid_config',
      message: `Density mode requires exactly 3 sizes (1x, 2x, 3x), got ${config.sizes.length}`,
    });
  }

  for (const size of config.sizes) {
    if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > 4096) {
      errors.push({
        type: 'invalid_config',
        message: `Invalid size "${size}": must be an integer between 1 and 4096`,
      });
    }
  }

  // Check for duplicates
  const uniqueSizes = new Set(config.sizes);
  if (uniqueSizes.size !== config.sizes.length) {
    errors.push({
      type: 'invalid_config',
      message: 'sizes array contains duplicate values',
    });
  }

  return errors;
}

/**
 * Load icons configuration
 */
export function loadIconsConfig(configDir: string): { config: IconsConfig; errors: ValidationError[] } {
  const filePath = path.join(configDir, 'icons.config.json');
  const result = loadJsonFile<IconsConfig>(filePath);

  if ('type' in result) {
    return { config: null as unknown as IconsConfig, errors: [result] };
  }

  const errors = validateIconsConfig(result);
  return { config: result, errors };
}

/**
 * Load sizes configuration
 */
export function loadSizesConfig(configDir: string): { config: SizesConfig; errors: ValidationError[] } {
  const filePath = path.join(configDir, 'sizes.config.json');
  const result = loadJsonFile<SizesConfig>(filePath);

  if ('type' in result) {
    return { config: null as unknown as SizesConfig, errors: [result] };
  }

  const errors = validateSizesConfig(result);
  return { config: result, errors };
}
