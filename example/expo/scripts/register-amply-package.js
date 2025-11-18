#!/usr/bin/env node

/**
 * Post-prebuild script to register AmplyPackage in MainApplication
 *
 * This script runs after expo prebuild to modify the MainApplication.kt file
 * and register AmplyPackage. This is necessary because Expo's config plugin
 * system doesn't reliably execute for workspace dependencies.
 */

const fs = require('fs');
const path = require('path');

const mainApplicationPath = path.join(
  __dirname,
  '..',
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'amply',
  'expoexample',
  'MainApplication.kt'
);

function registerAmplyPackage() {
  if (!fs.existsSync(mainApplicationPath)) {
    console.error(`ERROR: MainApplication.kt not found at ${mainApplicationPath}`);
    console.error('Make sure you run this script after expo prebuild');
    process.exit(1);
  }

  let contents = fs.readFileSync(mainApplicationPath, 'utf-8');

  // Check if already registered
  if (contents.includes('AmplyPackage')) {
    console.log('✓ AmplyPackage is already registered in MainApplication');
    return;
  }

  // Add import
  if (!contents.includes('import com.amply.reactnative.AmplyPackage')) {
    const importIndex = contents.lastIndexOf('import expo.modules.ReactNativeHostWrapper');
    if (importIndex !== -1) {
      const endOfImportLine = contents.indexOf('\n', importIndex);
      const newImport = '\nimport com.amply.reactnative.AmplyPackage';
      contents = contents.substring(0, endOfImportLine) + newImport + contents.substring(endOfImportLine);
      console.log('✓ Added import for AmplyPackage');
    }
  }

  // Register in getPackages()
  // Look for the pattern: .apply { ... } with optional comments/whitespace
  const applyPattern = /\.apply\s*\{[\s\S]*?\}/;
  const match = contents.match(applyPattern);

  if (match) {
    // Replace with version that includes AmplyPackage
    const replacement = `.apply {
              add(AmplyPackage())
            }`;
    contents = contents.replace(applyPattern, replacement);
    console.log('✓ Added AmplyPackage() registration in getPackages()');
  } else {
    console.warn('⚠ Could not find .apply { } block in getPackages() - manual registration may be needed');
  }

  // Write back
  fs.writeFileSync(mainApplicationPath, contents, 'utf-8');
  console.log(`✓ Updated MainApplication.kt with AmplyPackage registration`);
}

try {
  registerAmplyPackage();
  console.log('\n✓ Amply package registration complete');
} catch (error) {
  console.error('\n✗ Failed to register Amply package:', error.message);
  process.exit(1);
}
