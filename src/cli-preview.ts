#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writePreviewHtml } from './preview.js';
import { Manifest } from './rasterize.js';

const PROJECT_ROOT = process.cwd();
const ICONS_DIST_DIR = path.join(PROJECT_ROOT, 'icons-dist');

async function main(): Promise<void> {
  console.log('Icon Pipeline - Generate Preview\n');

  // Load manifest
  const manifestPath = path.join(ICONS_DIST_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`Error: manifest.json not found at ${manifestPath}`);
    console.error('Run "npm run build" first to generate icons.');
    process.exit(1);
  }

  let manifest: Manifest;
  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    manifest = JSON.parse(content);
  } catch (err) {
    console.error(`Error: Failed to parse manifest.json: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  console.log(`Found ${Object.keys(manifest.icons).length} icons in manifest`);
  console.log(`Sizes: ${manifest.sizes.join(', ')}px`);

  // Generate preview
  console.log('\nGenerating preview HTML...');
  const outputPath = writePreviewHtml(ICONS_DIST_DIR, manifest);

  console.log(`\nPreview generated: ${path.relative(PROJECT_ROOT, outputPath)}`);
  console.log(`\nOpen in browser: file://${outputPath}`);
  process.exit(0);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
