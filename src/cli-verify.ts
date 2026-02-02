#!/usr/bin/env node

import * as path from 'node:path';
import { loadIconsConfig, loadSizesConfig } from './config.js';
import { verifyBuild, formatVerifyResult } from './verify.js';

const PROJECT_ROOT = process.cwd();
const ICONS_SRC_DIR = path.join(PROJECT_ROOT, 'icons-src');
const ICONS_DIST_DIR = path.join(PROJECT_ROOT, 'icons-dist');
const CONFIG_DIR = path.join(PROJECT_ROOT, 'config');

async function main(): Promise<void> {
  console.log('Icon Pipeline - Verify Build\n');

  // Load configurations
  console.log('Loading configurations...');

  const { config: iconsConfig, errors: iconsErrors } = loadIconsConfig(CONFIG_DIR);
  if (iconsErrors.length > 0) {
    console.error('Error loading icons config:');
    for (const error of iconsErrors) {
      console.error(`  ${error.message}`);
    }
    process.exit(1);
  }

  const { config: sizesConfig, errors: sizesErrors } = loadSizesConfig(CONFIG_DIR);
  if (sizesErrors.length > 0) {
    console.error('Error loading sizes config:');
    for (const error of sizesErrors) {
      console.error(`  ${error.message}`);
    }
    process.exit(1);
  }

  console.log(`  Loaded icons.config.json (${Object.keys(iconsConfig.icons).length} icon definitions)`);
  console.log(`  Loaded sizes.config.json (${sizesConfig.sizes.length} sizes: ${sizesConfig.sizes.join(', ')}px)`);

  // Run verification
  console.log('\nVerifying build output...');
  const result = verifyBuild(
    ICONS_SRC_DIR,
    ICONS_DIST_DIR,
    iconsConfig,
    sizesConfig
  );

  // Print results
  console.log('\n' + formatVerifyResult(result));

  process.exit(result.success ? 0 : 1);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
