/**
 * Expo Config Plugin for Amply React Native SDK
 *
 * What it does: built-in campaigns. `npx @amplytools/cli bundle` writes
 * `amply-bundle.android.json` and `amply-bundle.ios.json` at the project root;
 * at `expo prebuild` this plugin copies them to where the native SDK reads them
 * (`android/app/src/main/assets/amply-bundle.json`, and `ios/<Project>/amply-bundle.json`
 * registered as a resource of the app target). See `builtInBundle.ts`.
 * A project without those files gets no change and no output, so listing the
 * plugin is harmless everywhere and needed only for built-in campaigns.
 *
 * What it does NOT do: register the native module. React Native autolinking
 * (`react-native.config.js`) has done that on both platforms since v0.2.12,
 * when this plugin became a no-op pass-through kept only so that projects
 * still listing it in app.json would not fail prebuild.
 *
 * Deliberately silent. It used to print a removal notice on every config
 * evaluation, which meant every `expo prebuild` of every project that still
 * carried the legacy entry — a line nobody could act on from inside their build
 * output, repeated forever. Keep it that way: no logging on the path where
 * there is nothing to copy. Do NOT delete this file either; `app.plugin.js`
 * resolves to it, and a project with the entry in app.json would fail prebuild
 * outright.
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

import {
  ConfigPlugin,
  IOSConfig,
  withDangerousMod,
  withXcodeProject,
} from '@expo/config-plugins';

import { addIosBundle, copyAndroidBundle } from './builtInBundle';

type WithAmplyPluginProps = {
  // Reserved for future use.
};

const withAmplyBundleAndroid: ConfigPlugin = (config) =>
  withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const { projectRoot, platformProjectRoot } = modConfig.modRequest;
      copyAndroidBundle(projectRoot, platformProjectRoot);
      return modConfig;
    },
  ]);

const withAmplyBundleIos: ConfigPlugin = (config) =>
  withXcodeProject(config, (modConfig) => {
    const { projectRoot, platformProjectRoot } = modConfig.modRequest;
    const projectName =
      modConfig.modRequest.projectName ?? IOSConfig.XcodeUtils.getProjectName(projectRoot);
    addIosBundle({ projectRoot, platformProjectRoot, projectName, project: modConfig.modResults });
    return modConfig;
  });

const withAmply: ConfigPlugin<WithAmplyPluginProps> = (config) =>
  withAmplyBundleIos(withAmplyBundleAndroid(config));

export default withAmply;
