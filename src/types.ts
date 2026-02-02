/**
 * Hex color string in #RRGGBB format
 */
export type HexColor = `#${string}`;

/**
 * Layer color mappings - maps element IDs or class names to hex colors
 */
export type LayerColors = Record<string, HexColor>;

/**
 * Background shape types
 */
export type BackgroundShape = 'circle' | 'rounded-square' | 'square' | 'none';

/**
 * Default values for icon configuration
 */
export const ICON_CONFIG_DEFAULTS = {
  shape: 'circle' as BackgroundShape,
  padding: 0.2,
};

/**
 * Configuration for a single icon
 */
export interface IconConfig {
  /** Background shape color */
  background: HexColor;
  /** Background shape type (default: "circle") */
  shape?: BackgroundShape;
  /** Padding ratio 0-1 for icon inset (default: 0.2) */
  padding?: number;
  /** Maps SVG element IDs or class names to their fill/stroke colors */
  layers: LayerColors;
}

/**
 * Icons configuration file structure
 */
export interface IconsConfig {
  /** Per-icon configuration keyed by icon name */
  icons: Record<string, IconConfig>;
  /** Default configuration for icons not explicitly listed */
  defaults: IconConfig;
}

/**
 * Density output mode
 */
export type DensityMode = 'size-folders' | 'density' | 'both';

/**
 * Default density mode
 */
export const DEFAULT_DENSITY_MODE: DensityMode = 'size-folders';

/**
 * Sizes configuration file structure
 */
export interface SizesConfig {
  /** Output mode: size-folders, density, or both */
  densityMode?: DensityMode;
  /** Array of pixel sizes to generate */
  sizes: number[];
}

/**
 * Validation error with context
 */
export interface ValidationError {
  type: 'invalid_filename' | 'invalid_config' | 'missing_file' | 'parse_error';
  message: string;
  file?: string;
  iconKey?: string;
}

/**
 * Represents an icon to be processed
 */
export interface IconEntry {
  /** Icon key derived from filename (without extension) */
  key: string;
  /** Full path to the SVG file */
  svgPath: string;
  /** Resolved configuration (specific or defaults) */
  config: IconConfig;
  /** Whether using default config */
  usingDefaults: boolean;
}

/**
 * Build plan entry for dry-run output
 */
export interface BuildPlanEntry {
  iconKey: string;
  svgPath: string;
  sizes: number[];
  background: HexColor;
  shape: BackgroundShape;
  padding: number;
  layers: LayerColors;
  usingDefaults: boolean;
  outputFiles: string[];
}

/**
 * Icon key validation regex: lowercase alphanumeric and underscores only
 */
export const ICON_KEY_PATTERN = /^[a-z0-9_]+$/;

/**
 * Hex color validation regex
 */
export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
