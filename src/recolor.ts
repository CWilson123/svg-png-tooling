import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { IconConfig, LayerColors } from './types.js';

export interface RecolorResult {
  iconKey: string;
  svgContent: string;
  usedSemanticRecolor: boolean;
  warnings: string[];
  errors: string[];
}

interface ElementMatch {
  element: Element;
  layerKey: string;
}

/**
 * Check if an element has an id or class matching the given key
 */
function elementMatchesLayerKey(element: Element, layerKey: string): boolean {
  const id = element.getAttribute('id');
  if (id === layerKey) return true;

  const classList = element.getAttribute('class');
  if (classList) {
    const classes = classList.split(/\s+/);
    if (classes.includes(layerKey)) return true;
  }

  return false;
}

/**
 * Find all elements matching layer keys by id or class
 */
function findSemanticMatches(doc: Document, layers: LayerColors): ElementMatch[] {
  const matches: ElementMatch[] = [];
  const layerKeys = Object.keys(layers);

  // Get all elements in the document
  const allElements = doc.getElementsByTagName('*');

  for (let i = 0; i < allElements.length; i++) {
    const element = allElements[i];
    for (const layerKey of layerKeys) {
      if (elementMatchesLayerKey(element, layerKey)) {
        matches.push({ element, layerKey });
      }
    }
  }

  return matches;
}

/**
 * Check if href/xlink:href points to an external resource
 */
function isExternalReference(href: string | null): boolean {
  if (!href) return false;
  // Internal references start with #
  if (href.startsWith('#')) return false;
  // Data URIs are inline
  if (href.startsWith('data:')) return false;
  // Everything else is external
  return true;
}

/**
 * Remove external references from the SVG
 */
function removeExternalReferences(doc: Document, warnings: string[]): void {
  // Remove all <image> elements
  const images = doc.getElementsByTagName('image');
  const imagesToRemove: Element[] = [];
  for (let i = 0; i < images.length; i++) {
    imagesToRemove.push(images[i]);
  }
  for (const img of imagesToRemove) {
    warnings.push(`Removed <image> element (external references not allowed)`);
    img.parentNode?.removeChild(img);
  }

  // Check all elements for external href/xlink:href
  const allElements = doc.getElementsByTagName('*');
  const elementsToRemove: Element[] = [];

  for (let i = 0; i < allElements.length; i++) {
    const element = allElements[i];
    const href = element.getAttribute('href');
    const xlinkHref = element.getAttributeNS('http://www.w3.org/1999/xlink', 'href');

    if (isExternalReference(href)) {
      element.removeAttribute('href');
      warnings.push(`Removed external href="${href}" from <${element.tagName}>`);
      // If element depends on the reference (like <use>), remove it
      if (element.tagName === 'use') {
        elementsToRemove.push(element);
      }
    }

    if (isExternalReference(xlinkHref)) {
      element.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
      warnings.push(`Removed external xlink:href="${xlinkHref}" from <${element.tagName}>`);
      // If element depends on the reference (like <use>), remove it
      if (element.tagName === 'use') {
        elementsToRemove.push(element);
      }
    }
  }

  for (const element of elementsToRemove) {
    warnings.push(`Removed <${element.tagName}> element (depended on external reference)`);
    element.parentNode?.removeChild(element);
  }
}

/**
 * Normalize the SVG element (ensure viewBox, strip width/height)
 */
function normalizeSvgElement(svgElement: Element, errors: string[]): boolean {
  // Check for viewBox
  const viewBox = svgElement.getAttribute('viewBox');
  if (!viewBox) {
    errors.push('SVG is missing required viewBox attribute');
    return false;
  }

  // Strip width and height
  svgElement.removeAttribute('width');
  svgElement.removeAttribute('height');

  return true;
}

/**
 * Apply semantic recoloring to matched elements
 */
function applySemanticRecolor(matches: ElementMatch[], layers: LayerColors): void {
  for (const { element, layerKey } of matches) {
    const color = layers[layerKey];

    if (layerKey === 'fill') {
      const currentFill = element.getAttribute('fill');
      // Don't override explicit "none"
      if (currentFill !== 'none') {
        element.setAttribute('fill', color);
      }
    } else if (layerKey === 'stroke') {
      const currentStroke = element.getAttribute('stroke');
      // Don't override explicit "none"
      if (currentStroke !== 'none') {
        element.setAttribute('stroke', color);
      }
    } else {
      // For other layer keys (like "accent"), apply as fill by default
      // unless the element has stroke semantics
      const currentFill = element.getAttribute('fill');
      if (currentFill !== 'none') {
        element.setAttribute('fill', color);
      }
    }
  }
}

/**
 * Elements that typically should be recolored
 */
const RECOLORABLE_ELEMENTS = new Set([
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'g'
]);

/**
 * Check if an attribute is effectively "set" (not null/undefined/empty)
 */
function hasAttribute(element: Element, attr: string): boolean {
  const value = element.getAttribute(attr);
  return value !== null && value !== '';
}

/**
 * Apply fallback recoloring to all elements
 */
function applyFallbackRecolor(doc: Document, layers: LayerColors): void {
  const fillColor = layers['fill'];
  const strokeColor = layers['stroke'];

  // Handle root svg element's stroke/fill (for inheritance)
  const svgRoot = doc.documentElement;
  if (svgRoot) {
    const rootStroke = svgRoot.getAttribute('stroke');
    const rootFill = svgRoot.getAttribute('fill');

    // Replace root stroke if set and not "none" (children inherit this)
    if (rootStroke && rootStroke !== 'none' && strokeColor) {
      svgRoot.setAttribute('stroke', strokeColor);
    }

    // Replace root fill if set and not "none" (children inherit this)
    if (rootFill && rootFill !== 'none' && fillColor) {
      svgRoot.setAttribute('fill', fillColor);
    }
  }

  // Check if root svg has stroke set (children will inherit)
  const rootHasStroke = svgRoot && hasAttribute(svgRoot, 'stroke') &&
    svgRoot.getAttribute('stroke') !== 'none';

  const allElements = doc.getElementsByTagName('*');

  for (let i = 0; i < allElements.length; i++) {
    const element = allElements[i];
    const tagName = element.tagName.toLowerCase();

    // Skip non-recolorable elements
    if (!RECOLORABLE_ELEMENTS.has(tagName)) continue;

    const hasFill = hasAttribute(element, 'fill');
    const hasStroke = hasAttribute(element, 'stroke');
    const currentFill = element.getAttribute('fill');
    const currentStroke = element.getAttribute('stroke');

    // Replace existing fill (unless "none")
    if (hasFill && currentFill !== 'none' && fillColor) {
      element.setAttribute('fill', fillColor);
    }

    // Replace existing stroke (unless "none")
    if (hasStroke && currentStroke !== 'none' && strokeColor) {
      element.setAttribute('stroke', strokeColor);
    }

    // If element has neither fill nor stroke, add fill only
    // BUT: if root svg has stroke set (inheritance), don't add fill
    // (this preserves stroke-only icon styles like Lucide)
    if (!hasFill && !hasStroke && fillColor && !rootHasStroke) {
      element.setAttribute('fill', fillColor);
    }
  }
}

/**
 * Recolor an SVG according to the icon configuration
 */
export function recolorSvg(
  svgContent: string,
  iconKey: string,
  config: IconConfig
): RecolorResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  let usedSemanticRecolor = false;

  // Parse SVG
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');

  // Check for parse errors
  const parseErrors = doc.getElementsByTagName('parsererror');
  if (parseErrors.length > 0) {
    errors.push(`XML parse error: ${parseErrors[0].textContent}`);
    return { iconKey, svgContent: '', usedSemanticRecolor: false, warnings, errors };
  }

  // Get the SVG element
  const svgElement = doc.documentElement;
  if (!svgElement || svgElement.tagName !== 'svg') {
    errors.push('Document root is not an SVG element');
    return { iconKey, svgContent: '', usedSemanticRecolor: false, warnings, errors };
  }

  // Normalize SVG (check viewBox, strip width/height)
  if (!normalizeSvgElement(svgElement, errors)) {
    return { iconKey, svgContent: '', usedSemanticRecolor: false, warnings, errors };
  }

  // Remove external references
  removeExternalReferences(doc, warnings);

  // Find semantic matches
  const semanticMatches = findSemanticMatches(doc, config.layers);

  if (semanticMatches.length > 0) {
    // Apply semantic recoloring
    applySemanticRecolor(semanticMatches, config.layers);
    usedSemanticRecolor = true;
  } else {
    // Apply fallback recoloring
    applyFallbackRecolor(doc, config.layers);
    warnings.push(
      `No elements matched semantic layer IDs/classes. Fallback recoloring applied.`
    );
  }

  // Serialize back to string
  const serializer = new XMLSerializer();
  const outputSvg = serializer.serializeToString(doc);

  return {
    iconKey,
    svgContent: outputSvg,
    usedSemanticRecolor,
    warnings,
    errors,
  };
}
