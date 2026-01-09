#!/usr/bin/env node

/**
 * Post-prebuild script to register AmplyPackage in MainApplication
 *
 * WHY THIS SCRIPT EXISTS:
 * When developing with local/workspace SDK sources (e.g., "file:../../" dependency),
 * Expo's autolinking and config plugin system don't reliably detect and register
 * the native package. This is because:
 *
 * 1. Autolinking scans node_modules for react-native.config.js, but workspace
 *    symlinks can cause detection issues
 * 2. Config plugins may not execute properly for local dependencies that aren't
 *    published to npm
 *
 * This script manually patches MainApplication.kt after prebuild to ensure
 * AmplyPackage is registered correctly.
 *
 * NOTE: For production apps using the published @amply/amply-react-native package
 * from npm, this script should NOT be needed - autolinking should work automatically.
 *
 * This script only applies to Android. For iOS-only builds, it will skip gracefully.
 */

const fs = require('fs');
const path = require('path');

const androidDir = path.join(__dirname, '..', 'android');
const mainApplicationPath = path.join(
  androidDir,
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
  // Check if Android directory exists (may not exist for iOS-only prebuild)
  if (!fs.existsSync(androidDir)) {
    console.log('ℹ Android directory not found - skipping Android package registration');
    console.log('  (This is normal for iOS-only builds)');
    return;
  }

  if (!fs.existsSync(mainApplicationPath)) {
    console.warn(`⚠ MainApplication.kt not found at ${mainApplicationPath}`);
    console.warn('  Android prebuild may not have completed. Skipping registration.');
    return;
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
