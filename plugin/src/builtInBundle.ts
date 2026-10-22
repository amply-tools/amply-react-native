/**
 * Built-in campaigns: puts the bundle `npx @amplytools/cli bundle` wrote at the project root
 * where the native SDK reads it.
 *
 * The SDK looks in exactly one place per platform and takes no configuration:
 * - Android: `amply-bundle.json` at the root of the APK's assets;
 * - iOS: a main-bundle resource named `amply-bundle.json`.
 *
 * An Expo managed project has no native folders to commit those files into, so the CLI writes
 * `amply-bundle.android.json` and `amply-bundle.ios.json` next to app.json, and prebuild copies
 * them in. A platform without its file is skipped without a word: most projects have no built-in
 * campaigns, and their prebuild output must not change.
 */

import { IOSConfig, XcodeProject } from '@expo/config-plugins';
import fs from 'fs';
import path from 'path';

export const BUNDLE_FILE_NAME = 'amply-bundle.json';
export const ANDROID_BUNDLE_SOURCE = 'amply-bundle.android.json';
export const IOS_BUNDLE_SOURCE = 'amply-bundle.ios.json';
/** Relative to the Android project root (`android/`). */
export const ANDROID_BUNDLE_TARGET = path.join('app', 'src', 'main', 'assets', BUNDLE_FILE_NAME);

/**
 * Copies `<projectRoot>/amply-bundle.android.json` to
 * `android/app/src/main/assets/amply-bundle.json`.
 * Returns whether there was a bundle to copy.
 */
export function copyAndroidBundle(projectRoot: string, platformProjectRoot: string): boolean {
  const source = path.join(projectRoot, ANDROID_BUNDLE_SOURCE);
  if (!fs.existsSync(source)) {
    return false;
  }
  const target = path.join(platformProjectRoot, ANDROID_BUNDLE_TARGET);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return true;
}

export type AddIosBundleOptions = {
  projectRoot: string;
  /** The `ios/` folder. */
  platformProjectRoot: string;
  /** The app target's folder and group, `ios/<projectName>/` — where Info.plist lives. */
  projectName: string;
  project: XcodeProject;
};

/**
 * Copies `<projectRoot>/amply-bundle.ios.json` to `ios/<projectName>/amply-bundle.json` and makes
 * it a resource of the app target (Copy Bundle Resources), once: a second prebuild over the same
 * native folder finds the file reference and adds nothing. Returns whether there was a bundle.
 *
 * Same steps Expo takes for `ios.googleServicesFile`.
 */
export function addIosBundle({
  projectRoot,
  platformProjectRoot,
  projectName,
  project,
}: AddIosBundleOptions): boolean {
  const source = path.join(projectRoot, IOS_BUNDLE_SOURCE);
  if (!fs.existsSync(source)) {
    return false;
  }
  fs.copyFileSync(source, path.join(platformProjectRoot, projectName, BUNDLE_FILE_NAME));

  const resourcePath = `${projectName}/${BUNDLE_FILE_NAME}`;
  if (!project.hasFile(resourcePath)) {
    IOSConfig.XcodeUtils.addResourceFileToGroup({
      filepath: resourcePath,
      groupName: projectName,
      project,
      isBuildFile: true,
      verbose: true,
    });
  }
  return true;
}
