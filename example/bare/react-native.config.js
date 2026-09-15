const path = require('path');

/**
 * Autolinking points at the library root, so the bridge is built from source on both platforms
 * without an explicit Gradle include or a Podfile entry.
 *
 * The key is the PUBLISHED package name. It used to be a legacy `@amply/amply-react-native`
 * alias, which meant the one example the release gate builds resolved the SDK under a name no
 * integrator could type.
 */
module.exports = {
  dependencies: {
    '@amplytools/react-native-amply-sdk': {
      root: path.resolve(__dirname, '..', '..'),
    },
  },
};
