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
  addToCustomPropertySet: jest.fn(),
  removeFromCustomPropertySet: jest.fn(),
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

  // String sets: the native SDK owns normalisation and the limits (100 items, 255 characters,
  // 16 KB; 25 items for event params). JS only keeps values that are not lists of strings from
  // crossing the bridge, where each platform would turn them into something different.
  describe('string sets', () => {
    let debug: jest.SpyInstance;

    beforeEach(() => {
      debug = jest.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
      debug.mockRestore();
    });

    it('sets a list of strings as a single custom property', () => {
      Amply.setCustomProperty('tags', ['a', 'b']);

      expect(mockNativeModule.setCustomProperties).toHaveBeenCalledWith({ tags: ['a', 'b'] });
    });

    it('passes an empty list through: an empty set is a value, not "unset"', () => {
      Amply.setCustomProperty('tags', []);

      expect(mockNativeModule.setCustomProperties).toHaveBeenCalledWith({ tags: [] });
    });

    it('leaves the limits to the native SDK', () => {
      const items = Array.from({ length: 101 }, (_, index) => `item-${index}`);

      Amply.setCustomProperty('tags', items);

      expect(mockNativeModule.setCustomProperties).toHaveBeenCalledWith({ tags: items });
    });

    it('sets lists next to scalars in one setCustomProperties call', () => {
      Amply.setCustomProperties({ plan: 'pro', tags: ['a', 'b'], level: 3 });

      expect(mockNativeModule.setCustomProperties).toHaveBeenCalledWith({
        plan: 'pro',
        tags: ['a', 'b'],
        level: 3,
      });
    });

    it.each([
      ['a number', ['a', 1]],
      ['null', ['a', null]],
      ['a nested list', ['a', ['b']]],
      ['an object', ['a', { b: 'c' }]],
    ])('drops a list holding %s without calling native, with a debug line naming the key', (_label, value) => {
      Amply.setCustomProperty('tags', value as never);

      expect(mockNativeModule.setCustomProperties).not.toHaveBeenCalled();
      expect(debug).toHaveBeenCalledWith(expect.stringContaining('tags'));
    });

    it('drops only the invalid list from setCustomProperties and sends the rest', () => {
      Amply.setCustomProperties({ plan: 'pro', tags: ['a', 2] as never, ok: ['x'] });

      expect(mockNativeModule.setCustomProperties).toHaveBeenCalledWith({ plan: 'pro', ok: ['x'] });
      expect(debug).toHaveBeenCalledWith(expect.stringContaining('tags'));
    });

    it('does not call native when every value in setCustomProperties was dropped', () => {
      Amply.setCustomProperties({ tags: [false] as never });

      expect(mockNativeModule.setCustomProperties).not.toHaveBeenCalled();
    });

    it("leaves the caller's object as it was when it drops a value", () => {
      const properties = { plan: 'pro', tags: ['a', 2] as never };

      Amply.setCustomProperties(properties);

      expect(properties).toEqual({ plan: 'pro', tags: ['a', 2] });
    });

    it('reads a set back as a list', async () => {
      mockNativeModule.getCustomProperty.mockResolvedValueOnce({ value: ['a', 'b'] });

      const result = await Amply.getCustomProperty('tags');

      expect(result).toEqual(['a', 'b']);
    });

    it.each([
      ['addToCustomPropertySet', Amply.addToCustomPropertySet],
      ['removeFromCustomPropertySet', Amply.removeFromCustomPropertySet],
    ] as const)('%s passes the key and the items to native', (name, mutate) => {
      mutate('tags', ['a', 'b']);

      expect(mockNativeModule[name]).toHaveBeenCalledWith('tags', ['a', 'b']);
    });

    it.each([
      ['addToCustomPropertySet', Amply.addToCustomPropertySet],
      ['removeFromCustomPropertySet', Amply.removeFromCustomPropertySet],
    ] as const)('%s drops items that are not all strings, with a debug line naming the key', (name, mutate) => {
      mutate('tags', ['a', 7] as never);

      expect(mockNativeModule[name]).not.toHaveBeenCalled();
      expect(debug).toHaveBeenCalledWith(expect.stringContaining('tags'));
    });

    it.each([
      ['addToCustomPropertySet', Amply.addToCustomPropertySet],
      ['removeFromCustomPropertySet', Amply.removeFromCustomPropertySet],
    ] as const)('%s drops a value that is not a list at all', (name, mutate) => {
      mutate('tags', 'a' as never);

      expect(mockNativeModule[name]).not.toHaveBeenCalled();
      expect(debug).toHaveBeenCalledWith(expect.stringContaining('tags'));
    });

    it('exposes both mutations on the default export', () => {
      expect(typeof Amply.default.addToCustomPropertySet).toBe('function');
      expect(typeof Amply.default.removeFromCustomPropertySet).toBe('function');
      expect(Amply.default.addToCustomPropertySet).toBe(Amply.addToCustomPropertySet);
      expect(Amply.default.removeFromCustomPropertySet).toBe(Amply.removeFromCustomPropertySet);
    });

    it('passes a string list in trackEvent params through unchanged', async () => {
      await Amply.trackEvent('Purchase', { sku: 'A', tags: ['sale', 'new'] });

      expect(mockNativeModule.track).toHaveBeenCalledWith({
        name: 'Purchase',
        properties: { sku: 'A', tags: ['sale', 'new'] },
      });
    });
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
