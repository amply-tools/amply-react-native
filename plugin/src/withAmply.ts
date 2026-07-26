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
 * Deliberately silent. It used to print that removal notice on every config
 * evaluation, which meant every `expo prebuild` of every project that still
 * carried the legacy entry — a line nobody could act on from inside their build
 * output, repeated forever. The guidance lives where someone can actually use
 * it: the integration skill and the docs. Do NOT delete this file to "finish
 * the job" either; `app.plugin.js` resolves to it, and a project with the entry
 * in app.json would fail prebuild outright.
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

const withAmply: ConfigPlugin<WithAmplyPluginProps> = (config) => config;

export default withAmply;
