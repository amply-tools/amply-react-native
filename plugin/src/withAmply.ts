/**
 * Expo Config Plugin for Amply React Native SDK
 *
 * The Amply React Native SDK is a TurboModule that uses react-native.config.js
 * for autolinking in Bare React Native. For Expo apps, this plugin ensures
 * AmplyPackage is registered in MainApplication.
 *
 * Architecture:
 * - Bare RN: Uses react-native.config.js autolinking (fully automatic)
 * - Expo: Uses react-native.config.js + Expo config plugin for registration
 *
 * Usage:
 * 1. Add to app.json: "@amply/amply-react-native" in plugins array
 * 2. Run: expo prebuild --clean
 * 3. Run: expo start and expo run:android
 */

import { ConfigPlugin, withMainApplication } from '@expo/config-plugins';

type WithAmplyPluginProps = {
  // Props for future use
};

/**
 * Expo Config Plugin for Amply React Native SDK
 *
 * Registers AmplyPackage in MainApplication for Expo apps.
 * The native module discovery still uses react-native.config.js.
 */
const withAmply: ConfigPlugin<WithAmplyPluginProps> = (config) => {
  return withMainApplication(config, async (cfg) => {
    let contents = cfg.modResults.contents;

    // Check if AmplyPackage is already imported
    if (!contents.includes('import tools.amply.sdk.reactnative.AmplyPackage')) {
      // Add import after the expo imports
      contents = contents.replace(
        /(import expo\.modules\.ReactNativeHostWrapper)/,
        `import tools.amply.sdk.reactnative.AmplyPackage\n$1`
      );
    }

    // For Kotlin syntax: packages.apply { ... }
    // We need to add the package instance inside the apply block
    if (!contents.includes('add(AmplyPackage())')) {
      contents = contents.replace(
        /(PackageList\(this\)\.packages\.apply \{[\s\S]*?)(\/\/ add.*?)\n(\s+\})/,
        `$1$2\n              add(AmplyPackage())\n$3`
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
};

export default withAmply;
