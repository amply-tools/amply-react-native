/**
 * Expo Config Plugin for Amply React Native SDK
 *
 * Starting with v0.2.12 this plugin is a no-op: React Native autolinking now
 * handles AmplyPackage registration automatically on both Android and iOS.
 *
 * The plugin is kept as a pass-through so that consumers who have it listed
 * in their app.json plugins array (from earlier versions) continue to work
 * without changes. You can safely remove the entry from your app.json.
 *
 * Background: pre-0.2.12 the package shipped expo-module.config.json, which
 * made expo-modules-autolinking classify it as an Expo Module. Because the
 * SDK is actually a plain TurboModule (no expo.modules.kotlin subclass),
 * the package was hidden from RN CLI autolinking and never made it into
 * PackageList.java on Android — runtime failed with "Amply native module
 * 'Amply' not found". Fix: drop expo-module.config.json. RN autolinking now
 * picks the package up directly via react-native.config.js. The previous
 * manual add(AmplyPackage()) would risk duplicate registration if kept.
 */

import { ConfigPlugin } from '@expo/config-plugins';

type WithAmplyPluginProps = {
  // Reserved for future use.
};

const withAmply: ConfigPlugin<WithAmplyPluginProps> = (config) => {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log(
      '[amply] @amplytools/react-native-amply-sdk: the Expo config plugin is ' +
        'no longer required (autolinking handles native registration). You can ' +
        'safely remove "@amplytools/react-native-amply-sdk" from the `plugins` ' +
        'array in your app.json.'
    );
  }
  return config;
};

export default withAmply;
