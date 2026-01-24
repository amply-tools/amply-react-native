// Mock for react-native to avoid Flow type parsing issues in Jest
module.exports = {
  NativeModules: {},
  NativeEventEmitter: class NativeEventEmitter {
    constructor() {}
    addListener() { return { remove: () => {} }; }
    removeListener() {}
    removeAllListeners() {}
  },
  Platform: {
    OS: 'ios',
    select: (obj) => obj.ios ?? obj.default,
  },
  TurboModuleRegistry: {
    get: () => null,
    getEnforcing: () => ({}),
  },
};
