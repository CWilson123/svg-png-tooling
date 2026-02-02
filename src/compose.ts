import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { IconConfig, BackgroundShape, HexColor, ICON_CONFIG_DEFAULTS } from './types.js';

export interface ComposeResult {
  iconKey: string;
  svgContent: string;
  shape: BackgroundShape;
  errors: string[];
}

/** Internal viewBox size for composed SVGs */
const VIEWBOX_SIZE = 100;

/**
 * Generate the background shape SVG element
 */
function generateBackgroundShape(
  shape: BackgroundShape,
  color: HexColor,
  size: number
): string {
  switch (shape) {
    case 'circle':
      return `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${color}"/>`;

    case 'square':
      return `<rect x="0" y="0" width="${size}" height="${size}" fill="${color}"/>`;

    case 'rounded-square': {
      // Corner radius is ~15% of size for a nice rounded look
      const radius = size * 0.15;
      return `<rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${color}"/>`;
    }

    case 'none':
      return '';

    default:
      return '';
  }
}

/**
 * Extract viewBox dimensions from an SVG string
 */
function extractViewBox(svgContent: string): { minX: number; minY: number; width: number; height: number } | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svgElement = doc.documentElement;

  if (!svgElement) return null;

  const viewBox = svgElement.getAttribute('viewBox');
  if (!viewBox) return null;

  const parts = viewBox.trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return null;

  return {
    minX: parts[0],
    minY: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

/**
 * Presentational attributes that should be inherited from the SVG root
 * These need to be copied to the <g> wrapper to preserve style inheritance
 */
const INHERITABLE_STYLE_ATTRS = [
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'stroke-opacity',
  'fill-opacity', 'fill-rule', 'opacity', 'color'
];

/**
 * Extract inheritable style attributes from the SVG root element
 */
function extractRootStyles(svgContent: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svgElement = doc.documentElement;

  if (!svgElement) return '';

  const attrs: string[] = [];
  for (const attr of INHERITABLE_STYLE_ATTRS) {
    const value = svgElement.getAttribute(attr);
    if (value !== null && value !== '') {
      attrs.push(`${attr}="${value}"`);
    }
  }

  return attrs.join(' ');
}

/**
 * Get the inner SVG content (everything inside the <svg> tags)
 */
function getInnerSvgContent(svgContent: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svgElement = doc.documentElement;

  if (!svgElement) return '';

  const serializer = new XMLSerializer();
  let inner = '';

  for (let i = 0; i < svgElement.childNodes.length; i++) {
    inner += serializer.serializeToString(svgElement.childNodes[i]);
  }

  return inner;
}

/**
 * Compose a background shape with a recolored SVG
 */
export function composeSvg(
  recoloredSvgContent: string,
  iconKey: string,
  config: IconConfig
): ComposeResult {
  const errors: string[] = [];

  // Get resolved shape and padding
  const shape = config.shape ?? ICON_CONFIG_DEFAULTS.shape;
  const padding = config.padding ?? ICON_CONFIG_DEFAULTS.padding;

  // For "none" shape, just return the recolored SVG with normalized viewBox
  if (shape === 'none') {
    const viewBox = extractViewBox(recoloredSvgContent);
    if (!viewBox) {
      errors.push('Could not extract viewBox from recolored SVG');
      return { iconKey, svgContent: '', shape, errors };
    }

    // Return with square viewBox
    const innerContent = getInnerSvgContent(recoloredSvgContent);
    const rootStyles = extractRootStyles(recoloredSvgContent);
    const maxDim = Math.max(viewBox.width, viewBox.height);
    const offsetX = (maxDim - viewBox.width) / 2 - viewBox.minX;
    const offsetY = (maxDim - viewBox.height) / 2 - viewBox.minY;

    const composed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}">
  <g ${rootStyles} transform="translate(${offsetX * (VIEWBOX_SIZE / maxDim)}, ${offsetY * (VIEWBOX_SIZE / maxDim)}) scale(${VIEWBOX_SIZE / maxDim})">
    ${innerContent}
  </g>
</svg>`;

    return { iconKey, svgContent: composed, shape, errors };
  }

  // Extract viewBox from the recolored SVG
  const viewBox = extractViewBox(recoloredSvgContent);
  if (!viewBox) {
    errors.push('Could not extract viewBox from recolored SVG');
    return { iconKey, svgContent: '', shape, errors };
  }

  // Calculate icon placement with padding
  const iconAreaSize = VIEWBOX_SIZE * (1 - padding * 2);
  const iconOffset = VIEWBOX_SIZE * padding;

  // Calculate scale to fit the icon in the padded area
  const maxDim = Math.max(viewBox.width, viewBox.height);
  const scale = iconAreaSize / maxDim;

  // Center the icon if it's not square
  const iconWidth = viewBox.width * scale;
  const iconHeight = viewBox.height * scale;
  const centerOffsetX = (iconAreaSize - iconWidth) / 2;
  const centerOffsetY = (iconAreaSize - iconHeight) / 2;

  // Get inner content of the recolored SVG
  const innerContent = getInnerSvgContent(recoloredSvgContent);

  // Extract root styles to apply to the <g> wrapper (preserves style inheritance)
  const rootStyles = extractRootStyles(recoloredSvgContent);

  // Generate background shape
  const backgroundShape = generateBackgroundShape(shape, config.background, VIEWBOX_SIZE);

  // Compose the final SVG
  const composed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}">
  ${backgroundShape}
  <g ${rootStyles} transform="translate(${iconOffset + centerOffsetX - viewBox.minX * scale}, ${iconOffset + centerOffsetY - viewBox.minY * scale}) scale(${scale})">
    ${innerContent}
  </g>
</svg>`;

  return {
    iconKey,
    svgContent: composed,
    shape,
    errors,
  };
}
