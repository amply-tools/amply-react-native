import * as Amply from '../index';
import {__setNativeModule} from '../nativeModule';

const mockNativeModule = {
  initialize: jest.fn(),
  isInitialized: jest.fn(() => true),
  track: jest.fn(),
  getRecentEvents: jest.fn(),
  getDataSetSnapshot: jest.fn(),
  registerDeepLinkListener: jest.fn(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
  onSystemEvent: jest.fn(),
  onDeepLink: jest.fn(),
  setCustomProperties: jest.fn(),
  getCustomProperty: jest.fn(),
  removeCustomProperty: jest.fn(),
  clearCustomProperties: jest.fn(),
};

describe('Amply JS API', () => {
  afterEach(() => {
    jest.clearAllMocks();
    __setNativeModule(null);
  });

  beforeEach(() => {
    __setNativeModule(mockNativeModule as never);
  });

  it('initializes the native module', async () => {
    await Amply.initialize({ appId: 'id', apiKeyPublic: 'public', apiKeySecret: 'secret' });

    expect(mockNativeModule.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'id', apiKeyPublic: 'public' })
    );
  });

  // A missing key used to reach the native SDK, whose config builder threw an exception that
  // crossed into Objective-C uncaught and aborted the host app — no JS try/catch could stop it.
  // Bad keys must cost the app its Amply, never its process.
  describe.each([
    ['apiKeySecret', { appId: 'id', apiKeyPublic: 'public' }],
    ['apiKeySecret', { appId: 'id', apiKeyPublic: 'public', apiKeySecret: '' }],
    ['apiKeySecret', { appId: 'id', apiKeyPublic: 'public', apiKeySecret: '   ' }],
    ['apiKeySecret', { appId: 'id', apiKeyPublic: 'public', apiKeySecret: null }],
    ['apiKeyPublic', { appId: 'id', apiKeyPublic: '', apiKeySecret: 'secret' }],
    ['appId', { appId: '', apiKeyPublic: 'public', apiKeySecret: 'secret' }],
  ])('when %s is missing (%j)', (field, config) => {
    it('rejects with AMP_INVALID_CONFIG, names the field and never calls the native module', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(Amply.initialize(config as never)).rejects.toMatchObject({
        code: 'AMP_INVALID_CONFIG',
        message: expect.stringContaining(field),
      });
      expect(mockNativeModule.initialize).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(expect.stringContaining(field));

      error.mockRestore();
    });
  });

  it('passes the base-URL overrides through to the native layer', async () => {
    await Amply.initialize({
      appId: 'id',
      apiKeyPublic: 'public',
      apiKeySecret: 'secret',
      configBaseUrl: 'https://config-staging.example.com',
      backendBaseUrl: 'https://api-staging.example.com',
    });

    expect(mockNativeModule.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        configBaseUrl: 'https://config-staging.example.com',
        backendBaseUrl: 'https://api-staging.example.com',
      })
    );
  });

  // `endpoint` is the older single-URL spelling. It stays accepted so existing
  // callers keep working, but it only ever meant the backend host — the campaign
  // manifest is served from a different one.
  it('still accepts the legacy endpoint spelling', async () => {
    await Amply.initialize({
      appId: 'id',
      apiKeyPublic: 'public',
      apiKeySecret: 'secret',
      endpoint: 'https://api-staging.example.com',
    });

    expect(mockNativeModule.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://api-staging.example.com' })
    );
  });

  it('tracks events through the native layer', async () => {
    await Amply.track({ name: 'Test Event', properties: { foo: 'bar' } });

    expect(mockNativeModule.track).toHaveBeenCalledWith({
      name: 'Test Event',
      properties: { foo: 'bar' },
    });
  });

  it('reads recent events', async () => {
    const events = [{ name: 'e1' }];
    mockNativeModule.getRecentEvents.mockResolvedValueOnce(events);

    const result = await Amply.getRecentEvents(3);

    expect(mockNativeModule.getRecentEvents).toHaveBeenCalledWith(3);
    expect(result).toBe(events);
  });

  it('requests dataset snapshots', async () => {
    const snapshot = { foo: 'bar' };
    mockNativeModule.getDataSetSnapshot.mockResolvedValueOnce(snapshot);

    const type = { kind: '@device' as const };
    const result = await Amply.getDataSetSnapshot(type);

    expect(mockNativeModule.getDataSetSnapshot).toHaveBeenCalledWith(type);
    expect(result).toBe(snapshot);
  });

  it.each([
    ['singleton @device', { kind: '@device' as const }],
    ['singleton @user', { kind: '@user' as const }],
    ['singleton @custom', { kind: '@custom' as const }],
    ['singleton @session', { kind: '@session' as const }],
    [
      '@triggeredEvent with global strategy',
      {
        kind: '@triggeredEvent' as const,
        data: {
          countStrategy: 'global' as const,
          params: [{ name: 'level', value: 5 }],
          eventName: 'LevelComplete',
        },
      },
    ],
    [
      '@triggeredEvent with session strategy and no eventName',
      {
        kind: '@triggeredEvent' as const,
        data: {
          countStrategy: 'session' as const,
          params: [],
        },
      },
    ],
    [
      '@events with mixed event types',
      {
        kind: '@events' as const,
        data: [
          { name: 'Purchase', type: 'custom' as const, params: [{ name: 'sku', value: 'ABC' }] },
          { name: 'SessionStarted', type: 'system' as const, params: [] },
        ],
      },
    ],
  ])('passes %s to the native bridge unchanged', async (_label, type) => {
    mockNativeModule.getDataSetSnapshot.mockResolvedValueOnce({});

    await Amply.getDataSetSnapshot(type);

    expect(mockNativeModule.getDataSetSnapshot).toHaveBeenCalledWith(type);
  });

  it('subscribes to system events through the TurboModule emitter', async () => {
    const remove = jest.fn();
    mockNativeModule.onSystemEvent.mockReturnValueOnce({ remove });

    const listener = jest.fn();
    const unsubscribe = await Amply.addSystemEventListener(listener);

    expect(mockNativeModule.onSystemEvent).toHaveBeenCalledTimes(1);

    // The native listener is a wrapper that filters DebugLog events
    const nativeListener = mockNativeModule.onSystemEvent.mock.calls[0][0];

    // DebugLog events should be filtered out
    nativeListener({ name: 'DebugLog', type: 'log', timestamp: 1, properties: {} });
    expect(listener).not.toHaveBeenCalled();

    // Other events should pass through
    const systemEvent = { name: 'SessionStart', type: 'system', timestamp: 2, properties: {} };
    nativeListener(systemEvent);
    expect(listener).toHaveBeenCalledWith(systemEvent);

    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('sets a single custom property via setCustomProperties', () => {
    Amply.setCustomProperty('plan', 'premium');

    expect(mockNativeModule.setCustomProperties).toHaveBeenCalledWith({
      plan: 'premium',
    });
  });

  it('sets multiple custom properties at once', () => {
    Amply.setCustomProperties({ plan: 'premium', age: 25, active: true });

    expect(mockNativeModule.setCustomProperties).toHaveBeenCalledWith({
      plan: 'premium',
      age: 25,
      active: true,
    });
  });

  it('gets a custom property value', async () => {
    mockNativeModule.getCustomProperty.mockResolvedValueOnce({ value: 'premium' });

    const result = await Amply.getCustomProperty('plan');

    expect(mockNativeModule.getCustomProperty).toHaveBeenCalledWith('plan');
    expect(result).toBe('premium');
  });

  it('returns null for a missing custom property', async () => {
    mockNativeModule.getCustomProperty.mockResolvedValueOnce({});

    const result = await Amply.getCustomProperty('nonexistent');

    expect(result).toBeNull();
  });

  it('removes a custom property', () => {
    Amply.removeCustomProperty('plan');

    expect(mockNativeModule.removeCustomProperty).toHaveBeenCalledWith('plan');
  });

  it('clears all custom properties', () => {
    Amply.clearCustomProperties();

    expect(mockNativeModule.clearCustomProperties).toHaveBeenCalled();
  });

  it('registers deep links once and subscribes via the TurboModule emitter', async () => {
    const remove = jest.fn();
    mockNativeModule.onDeepLink.mockReturnValue({ remove });

    const listener = jest.fn();
    const unsubscribe = await Amply.addDeepLinkListener(listener);
    expect(mockNativeModule.registerDeepLinkListener).toHaveBeenCalledTimes(1);
    expect(mockNativeModule.onDeepLink).toHaveBeenCalledWith(listener);

    await Amply.addDeepLinkListener(() => {});
    expect(mockNativeModule.registerDeepLinkListener).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
