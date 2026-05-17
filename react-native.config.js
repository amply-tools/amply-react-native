/**
 * Paths here MUST be relative to the package root. expo-modules-autolinking's
 * androidResolver does `path.join(packageRoot, sourceDir)`, and Node's
 * `path.join` with an absolute second arg produces a bogus concatenated path,
 * which makes `findGradleAndManifestAsync` come back empty and the package
 * gets silently dropped from PackageList.java. (Diagnosed during 0.2.12 work.)
 *
 * For the same reason, codegen paths use `__dirname` only where needed —
 * codegen runs from this package root anyway, so plain relative is also fine.
 */
module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: 'android',
        packageImportPath: 'import tools.amply.sdk.reactnative.AmplyPackage;',
        packageInstance: 'new AmplyPackage()',
        cmakeListsPath: 'src/main/jni/CMakeLists.txt',
      },
      // iOS is intentionally OMITTED here, NOT set to null.
      // RN CLI / expo-modules-autolinking auto-discovers the iOS pod via a
      // top-level *.podspec at the package root (AmplyReactNative.podspec).
      // Setting `ios: null` would explicitly opt OUT of iOS autolinking —
      // pre-0.2.13 we did exactly that and survived only because
      // `expo-module.config.json` pulled the pod through Expo autolinking;
      // when we dropped that file in 0.2.12 the iOS pod stopped being linked
      // (the 0.2.12 iOS regression).
      // Setting `ios: { podspecPath: ... }` does NOT work either:
      // expo-modules-autolinking's iosResolver ignores podspecPath and only
      // scans the package root for *.podspec.
    },
  },
  commands: [],
  assets: [],
  codegenConfig: {
    name: 'AmplyReactNative',
    type: 'modules',
    jsSrcsDir: 'src',
    android: {
      sourceDir: 'android/src/newarch',
      packageName: 'tools.amply.sdk.reactnative',
    },
    ios: {
      sourceDir: 'ios/Sources/AmplyReactNative',
    },
  },
};
