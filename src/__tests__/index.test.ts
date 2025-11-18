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
    await Amply.initialize({ appId: 'id', apiKeyPublic: 'public' });

    expect(mockNativeModule.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'id', apiKeyPublic: 'public' })
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

  it('subscribes to system events through the TurboModule emitter', async () => {
    const remove = jest.fn();
    mockNativeModule.onSystemEvent.mockReturnValueOnce({ remove });

    const listener = jest.fn();
    const unsubscribe = await Amply.addSystemEventListener(listener);

    expect(mockNativeModule.onSystemEvent).toHaveBeenCalledWith(listener);
    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
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
