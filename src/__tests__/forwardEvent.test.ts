/**
 * `forwardEvent` hands an event that originated in another analytics SDK to the native module,
 * which mirrors the `track` bridge but calls the SDK's `trackForwarded`.
 */
type SdkModule = typeof import('../index');

function loadWith(native: Record<string, unknown>): SdkModule {
  const withState = {isInitialized: () => true, ...native};
  let Amply!: SdkModule;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../nativeModule').__setNativeModule(withState as never);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Amply = require('../index');
  });
  return Amply;
}

describe('forwardEvent', () => {
  it('forwardEvent passes source, name, properties to the native module', async () => {
    const forwardEvent = jest.fn(() => Promise.resolve());
    const Amply = loadWith({forwardEvent});
    const payload = {source: 'amplitude', name: 'Purchase', properties: {sku: 'pro'}};

    await Amply.forwardEvent(payload);

    expect(forwardEvent).toHaveBeenCalledTimes(1);
    expect(forwardEvent).toHaveBeenCalledWith(payload);
  });

  it('propagates a native rejection', async () => {
    const Amply = loadWith({forwardEvent: jest.fn(() => Promise.reject(new Error('AMP_NOT_INITIALIZED')))});

    await expect(Amply.forwardEvent({source: 'amplitude', name: 'X'})).rejects.toThrow('AMP_NOT_INITIALIZED');
  });
});
