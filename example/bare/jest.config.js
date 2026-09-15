const path = require('path');

module.exports = {
  preset: 'react-native',
  /**
   * The screens live in `example/shared`, outside this project, so both examples render one
   * implementation. Jest resolves `node_modules` by walking up from the importing FILE, and that
   * walk from `example/shared` leaves this app's copies behind — it finds the SDK repo's own
   * `react-native` (a devDependency there) and no `react` at all. Pinning resolution to this
   * app's `node_modules` is the same fix `metro.config.js` applies with `resolveRequest`, for
   * the same reason.
   */
  modulePaths: [path.resolve(__dirname, 'node_modules')],
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@amply/sample-shared$': path.resolve(__dirname, '../shared/src/index.ts'),
    '^@amplytools/react-native-amply-sdk$': path.resolve(__dirname, '../../src/index.ts'),
    // Same singletons metro pins: without these, a file in example/shared resolves the SDK
    // repo's own `react-native` and gets an unmocked TurboModule registry.
    '^react$': path.resolve(__dirname, 'node_modules/react'),
    '^react-native$': path.resolve(__dirname, 'node_modules/react-native'),
  },
};
