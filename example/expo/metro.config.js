const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add the root node_modules to the watched folders
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

config.watchFolders = [
  ...config.watchFolders,
  monorepoRoot,
];

// Configure module resolution for monorepo
config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(monorepoRoot, 'node_modules'),
  ],
  // Ensure the SDK source is properly resolved
  sourceExts: ['ts', 'tsx', 'js', 'jsx', 'json', 'mjs'],
  // Platform-specific extensions
  platforms: ['ios', 'android', 'web'],
};

// Workaround for module resolution in monorepo setups
config.transformer = {
  ...config.transformer,
  // Enable async generators for better compatibility
  asyncRequireModulePath: require.resolve(
    'metro-runtime/src/modules/asyncRequire'
  ),
};

module.exports = config;
