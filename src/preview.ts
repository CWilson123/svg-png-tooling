import * as fs from 'node:fs';
import * as path from 'node:path';
import { Manifest } from './rasterize.js';
import { DensityMode } from './types.js';

/**
 * Generate a self-contained HTML preview of all icons
 */
export function generatePreviewHtml(
  outputDir: string,
  manifest: Manifest
): string {
  const sizes = manifest.sizes;
  const densityMode = manifest.densityMode || 'size-folders';
  const useSizeFolders = densityMode === 'size-folders' || densityMode === 'both';
  const useDensity = densityMode === 'density' || densityMode === 'both';
  const icons = Object.entries(manifest.icons).sort((a, b) => a[0].localeCompare(b[0]));

  // Collect file sizes for size-folder files
  const fileSizes: Record<string, Record<string, number>> = {};
  for (const [iconKey, iconData] of icons) {
    fileSizes[iconKey] = {};
    for (const [size, filePath] of Object.entries(iconData.files)) {
      const fullPath = path.join(outputDir, filePath);
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        fileSizes[iconKey][size] = stats.size;
      }
    }
  }

  // Collect file sizes for density files
  const densityFileSizes: Record<string, Record<string, number>> = {};
  if (useDensity) {
    for (const [iconKey, iconData] of icons) {
      densityFileSizes[iconKey] = {};
      if (iconData.densityFiles) {
        for (const [density, filePath] of Object.entries(iconData.densityFiles)) {
          const fullPath = path.join(outputDir, filePath);
          if (fs.existsSync(fullPath)) {
            const stats = fs.statSync(fullPath);
            densityFileSizes[iconKey][density] = stats.size;
          }
        }
      }
    }
  }

  // Read all PNGs and convert to base64 data URIs
  const imageData: Record<string, Record<string, string>> = {};
  for (const [iconKey, iconData] of icons) {
    imageData[iconKey] = {};
    for (const [size, filePath] of Object.entries(iconData.files)) {
      const fullPath = path.join(outputDir, filePath);
      if (fs.existsSync(fullPath)) {
        const buffer = fs.readFileSync(fullPath);
        const base64 = buffer.toString('base64');
        imageData[iconKey][size] = `data:image/png;base64,${base64}`;
      }
    }
  }

  // Read density PNGs
  const densityImageData: Record<string, Record<string, string>> = {};
  if (useDensity) {
    for (const [iconKey, iconData] of icons) {
      densityImageData[iconKey] = {};
      if (iconData.densityFiles) {
        for (const [density, filePath] of Object.entries(iconData.densityFiles)) {
          const fullPath = path.join(outputDir, filePath);
          if (fs.existsSync(fullPath)) {
            const buffer = fs.readFileSync(fullPath);
            const base64 = buffer.toString('base64');
            densityImageData[iconKey][density] = `data:image/png;base64,${base64}`;
          }
        }
      }
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Icon Preview - Generated ${manifest.generatedAt}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
      padding: 20px;
      line-height: 1.4;
    }
    h1 {
      margin-bottom: 8px;
      font-size: 24px;
    }
    .meta {
      color: #666;
      font-size: 14px;
      margin-bottom: 24px;
    }
    .size-section {
      margin-bottom: 40px;
    }
    .size-section h2 {
      font-size: 18px;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #ddd;
    }
    .icon-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    }
    .icon-card {
      background: white;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .icon-name {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 8px;
      word-break: break-all;
    }
    .icon-meta {
      font-size: 11px;
      color: #888;
      margin-bottom: 12px;
    }
    .icon-meta span {
      display: inline-block;
      margin-right: 8px;
    }
    .preview-row {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: center;
    }
    .preview-box {
      padding: 8px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .preview-box.light {
      background: #ffffff;
      border: 1px solid #e0e0e0;
    }
    .preview-box.dark {
      background: #1a1a1a;
      border: 1px solid #333;
    }
    .preview-box img {
      display: block;
    }
    .file-size {
      font-size: 10px;
      color: #999;
      text-align: center;
      margin-top: 8px;
    }
    .legend {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
      font-size: 12px;
      color: #666;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .legend-box {
      width: 16px;
      height: 16px;
      border-radius: 2px;
    }
    .legend-box.light {
      background: #ffffff;
      border: 1px solid #e0e0e0;
    }
    .legend-box.dark {
      background: #1a1a1a;
    }
  </style>
</head>
<body>
  <h1>Icon Preview</h1>
  <p class="meta">
    Generated: ${manifest.generatedAt}<br>
    Icons: ${icons.length} | Sizes: ${sizes.join(', ')}px | Mode: ${densityMode}${useDensity ? ` (base: ${manifest.baseSize}px)` : ''}
  </p>

  <div class="legend">
    <div class="legend-item">
      <div class="legend-box light"></div>
      <span>Light background</span>
    </div>
    <div class="legend-item">
      <div class="legend-box dark"></div>
      <span>Dark background</span>
    </div>
  </div>

${useDensity ? `
  <div class="size-section">
    <h2>Density Variants (@1x, @2x, @3x)</h2>
    <p style="font-size: 12px; color: #666; margin-bottom: 16px;">
      Base size: ${manifest.baseSize}px (1x) | 2x: ${sizes[1]}px | 3x: ${sizes[2]}px
    </p>
    <div class="icon-grid">
${icons.map(([iconKey, iconData]) => {
  const dataUri1x = densityImageData[iconKey]?.['1x'] || '';
  const dataUri2x = densityImageData[iconKey]?.['2x'] || '';
  const dataUri3x = densityImageData[iconKey]?.['3x'] || '';
  const fileSize1x = densityFileSizes[iconKey]?.['1x'] || 0;
  const fileSize2x = densityFileSizes[iconKey]?.['2x'] || 0;
  const fileSize3x = densityFileSizes[iconKey]?.['3x'] || 0;
  const totalSize = ((fileSize1x + fileSize2x + fileSize3x) / 1024).toFixed(1);
  const baseSize = manifest.baseSize || sizes[0];
  return `
      <div class="icon-card">
        <div class="icon-name">${iconKey}</div>
        <div class="icon-meta">
          <span>${iconData.shape}</span>
          <span>${iconData.background}</span>
        </div>
        <div class="preview-row">
          <div class="preview-box light" title="@1x">
            <img src="${dataUri1x}" width="${baseSize}" height="${baseSize}" alt="${iconKey} @1x">
          </div>
          <div class="preview-box dark" title="@1x">
            <img src="${dataUri1x}" width="${baseSize}" height="${baseSize}" alt="${iconKey} @1x">
          </div>
        </div>
        <div class="file-size">@1x: ${(fileSize1x / 1024).toFixed(1)}KB | @2x: ${(fileSize2x / 1024).toFixed(1)}KB | @3x: ${(fileSize3x / 1024).toFixed(1)}KB</div>
        <div class="file-size">Total: ${totalSize} KB</div>
      </div>`;
}).join('\n')}
    </div>
  </div>
` : ''}
${useSizeFolders ? sizes.map(size => `
  <div class="size-section">
    <h2>${size}px Icons</h2>
    <div class="icon-grid">
${icons.map(([iconKey, iconData]) => {
  const dataUri = imageData[iconKey]?.[String(size)] || '';
  const fileSize = fileSizes[iconKey]?.[String(size)] || 0;
  const fileSizeKB = (fileSize / 1024).toFixed(1);
  return `
      <div class="icon-card">
        <div class="icon-name">${iconKey}</div>
        <div class="icon-meta">
          <span>${iconData.shape}</span>
          <span>${iconData.background}</span>
        </div>
        <div class="preview-row">
          <div class="preview-box light">
            <img src="${dataUri}" width="${size}" height="${size}" alt="${iconKey}">
          </div>
          <div class="preview-box dark">
            <img src="${dataUri}" width="${size}" height="${size}" alt="${iconKey}">
          </div>
        </div>
        <div class="file-size">${fileSizeKB} KB</div>
      </div>`;
}).join('\n')}
    </div>
  </div>
`).join('\n') : ''}

</body>
</html>`;

  return html;
}

/**
 * Write preview HTML to disk
 */
export function writePreviewHtml(outputDir: string, manifest: Manifest): string {
  const previewDir = path.join(outputDir, 'preview');
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }

  const html = generatePreviewHtml(outputDir, manifest);
  const outputPath = path.join(previewDir, 'index.html');
  fs.writeFileSync(outputPath, html, 'utf-8');

  return outputPath;
}
