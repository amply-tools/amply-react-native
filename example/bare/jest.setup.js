const path = require('path');

/**
 * `AsyncStorage` and `react-native-safe-area-context` both reach for a native module the moment
 * they are imported, so a render test dies on the import rather than on anything it is testing.
 * Both ship their own official mocks; use those rather than hand-rolling.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-safe-area-context', () => {
  const inset = {top: 0, right: 0, bottom: 0, left: 0};
  return {
    ...jest.requireActual('react-native-safe-area-context'),
    SafeAreaProvider: ({children}) => children,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({x: 0, y: 0, width: 390, height: 844}),
  };
});

/**
 * The Amply bridge, stubbed through the SDK's own `__setNativeModule` testing seam rather than by
 * mocking the package. The app then runs its REAL code — the provider, the listeners, the launch
 * contract — against a fake bridge, which is the only version of this test worth having: mocking
 * `@amplytools/react-native-amply-sdk` itself would assert that a mock renders.
 */
const noopSubscription = {remove: () => {}};
const {__setNativeModule} = require(path.resolve(__dirname, '../../src/nativeModule'));
__setNativeModule({
  initialize: () => Promise.resolve(),
  isInitialized: () => false,
  track: () => Promise.resolve(),
  trackGated: () => Promise.resolve({outcome: 'proceed', reason: 'failOpen'}),
  resolveCampaign: () => {},
  registerGate: () => {},
  unregisterGate: () => {},
  getRecentEvents: () => Promise.resolve([]),
  getDataSetSnapshot: () => Promise.resolve({}),
  registerDeepLinkListener: () => {},
  setUserId: () => {},
  setLogLevel: () => {},
  getLogLevel: () => 'debug',
  setCustomProperties: () => {},
  getCustomProperty: () => Promise.resolve({}),
  removeCustomProperty: () => {},
  clearCustomProperties: () => {},
  onSystemEvent: () => noopSubscription,
  onDeepLink: () => noopSubscription,
  onCampaignPresent: () => noopSubscription,
  addListener: () => {},
  removeListeners: () => {},
});
