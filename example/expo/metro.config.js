const path = require('path');
const {getDefaultConfig} = require('expo/metro-config');

const projectRoot = __dirname;
// The SDK repo root: the linked package lives here, and so does `example/shared`.
const workspaceRoot = path.resolve(projectRoot, '..', '..');

const config = getDefaultConfig(projectRoot);

/**
 * Packages that must resolve to ONE copy for the whole bundle.
 *
 * The SDK repo root carries its own `node_modules/react-native` (a devDependency of the library),
 * and metro resolves a module by walking up from the importing FILE — so anything under
 * `example/shared` or the linked SDK found that copy instead of the app's. Two React Native
 * instances share no view-config registry, and the app dies on the first `<Text>` with
 * "View config getter callback for component `RCTText` must be a function (received
 * `undefined`)". `extraNodeModules` cannot fix it: that map is only consulted when normal
 * resolution FAILS, and here it succeeds — on the wrong copy.
 *
 * Expo's default resolver has the same hole; nothing about `expo/metro-config` closes it. It was
 * measured here, not assumed: `require.resolve('react-native', {paths: ['../shared/src']})`
 * lands on the repo root's 0.81.4 while this app is on 0.81.5.
 */
const SINGLETONS = [
  'react',
  'react-native',
  '@react-native-async-storage/async-storage',
  'react-native-safe-area-context',
  'react-native-screens',
  'expo',
  'expo-router',
];

/** A file that does not have to exist — metro only uses it to decide where the walk starts. */
const projectOrigin = path.join(projectRoot, 'index.js');

config.watchFolders = [...config.watchFolders, workspaceRoot];

config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
  ],
  extraNodeModules: {
    ...config.resolver.extraNodeModules,
    // The published package name — the same string an integrator writes.
    '@amplytools/react-native-amply-sdk': workspaceRoot,
    // Both examples render the same screens from one module; only navigation, safe-area,
    // deeplink registration and the target config stay per host.
    '@amply/sample-shared': path.resolve(workspaceRoot, 'example', 'shared'),
  },
  resolveRequest: (context, moduleName, platform) => {
    const isSingleton = SINGLETONS.some(
      name => moduleName === name || moduleName.startsWith(`${name}/`),
    );
    return context.resolveRequest(
      isSingleton ? {...context, originModulePath: projectOrigin} : context,
      moduleName,
      platform,
    );
  },
};

module.exports = config;
