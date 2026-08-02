import * as Amply from '../index';
import {__setNativeModule} from '../nativeModule';

type CampaignPresentEvent = {
  url: string;
  params: Record<string, unknown>;
  info: Record<string, unknown>;
  mediationId: string;
};

// Drains the microtask queue a few times so promise-chained presenter resolutions
// (sync or async) settle before assertions run.
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

const mockNativeModule = {
  initialize: jest.fn(),
  isInitialized: jest.fn(() => true),
  track: jest.fn(),
  trackGated: jest.fn(),
  resolveCampaign: jest.fn(),
  getRecentEvents: jest.fn(),
  getDataSetSnapshot: jest.fn(),
  registerDeepLinkListener: jest.fn(),
  registerGate: jest.fn(),
  unregisterGate: jest.fn(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
  onSystemEvent: jest.fn(),
  onDeepLink: jest.fn(),
  onCampaignPresent: jest.fn(),
  setCustomProperties: jest.fn(),
  getCustomProperty: jest.fn(),
  removeCustomProperty: jest.fn(),
  clearCustomProperties: jest.fn(),
};

describe('Amply gate API (trackGated + registerGate)', () => {
  afterEach(() => {
    jest.clearAllMocks();
    Amply.removeAllListeners();
    __setNativeModule(null);
  });

  beforeEach(() => {
    __setNativeModule(mockNativeModule as never);
  });

  describe('trackEvent (fire-and-forget)', () => {
    it('forwards to native track and never gates', async () => {
      await Amply.trackEvent('SaveTapped', {foo: 'bar'});

      expect(mockNativeModule.track).toHaveBeenCalledWith({
        name: 'SaveTapped',
        properties: {foo: 'bar'},
      });
      expect(mockNativeModule.trackGated).not.toHaveBeenCalled();
    });

    it('defaults missing properties to an empty object', async () => {
      await Amply.trackEvent('Ping');

      expect(mockNativeModule.track).toHaveBeenCalledWith({
        name: 'Ping',
        properties: {},
      });
    });
  });

  describe('trackGated', () => {
    it('resolves proceed/completed when the gate is satisfied', async () => {
      mockNativeModule.trackGated.mockResolvedValueOnce({
        outcome: 'proceed',
        reason: 'completed',
      });

      const decision = await Amply.trackGated('SaveTapped', {foo: 'bar'});

      expect(mockNativeModule.trackGated).toHaveBeenCalledWith('SaveTapped', {
        foo: 'bar',
      });
      expect(decision).toEqual({outcome: 'proceed', reason: 'completed'});
    });

    it('resolves proceed/failOpen when the native layer reports fail-open', async () => {
      mockNativeModule.trackGated.mockResolvedValueOnce({
        outcome: 'proceed',
        reason: 'failOpen',
      });

      const decision = await Amply.trackGated('SaveTapped', {});

      expect(decision).toEqual({outcome: 'proceed', reason: 'failOpen'});
    });

    it('resolves cancelled on a user dismiss under onAbort=cancel', async () => {
      mockNativeModule.trackGated.mockResolvedValueOnce({outcome: 'cancelled'});

      const decision = await Amply.trackGated('SaveTapped', undefined);

      expect(mockNativeModule.trackGated).toHaveBeenCalledWith('SaveTapped', {});
      expect(decision).toEqual({outcome: 'cancelled'});
    });

    it('never rejects — fails open to proceed/failOpen when native rejects', async () => {
      mockNativeModule.trackGated.mockRejectedValueOnce(new Error('boom'));

      const decision = await Amply.trackGated('SaveTapped', {});

      expect(decision).toEqual({outcome: 'proceed', reason: 'failOpen'});
    });

    it('fails open on an unexpected/malformed native decision', async () => {
      mockNativeModule.trackGated.mockResolvedValueOnce({outcome: 'wat'} as never);

      const decision = await Amply.trackGated('SaveTapped', {});

      expect(decision).toEqual({outcome: 'proceed', reason: 'failOpen'});
    });

    it('normalizes an unknown proceed reason to failOpen', async () => {
      mockNativeModule.trackGated.mockResolvedValueOnce({
        outcome: 'proceed',
        reason: 'something-else',
      } as never);

      const decision = await Amply.trackGated('SaveTapped', {});

      expect(decision).toEqual({outcome: 'proceed', reason: 'failOpen'});
    });
  });

  describe('registerGate', () => {
    it('registers on the native module and subscribes to onCampaignPresent', async () => {
      const remove = jest.fn();
      mockNativeModule.onCampaignPresent.mockReturnValue({remove});

      const presenter = jest.fn();
      const unsubscribe = await Amply.registerGate('stillframe://ad', presenter);

      expect(mockNativeModule.registerGate).toHaveBeenCalledTimes(1);
      expect(mockNativeModule.registerGate).toHaveBeenCalledWith('stillframe://ad', 'cancel', 0);
      expect(mockNativeModule.onCampaignPresent).toHaveBeenCalledTimes(1);

      unsubscribe();
      expect(remove).toHaveBeenCalledTimes(1);
      expect(mockNativeModule.unregisterGate).toHaveBeenCalledWith('stillframe://ad');
    });

    // This used to assert the opposite — that a second registration re-subscribed but did
    // NOT re-register natively. That encoded the defect: the second subscriber joined the
    // shared onCampaignPresent channel while the first stayed on it, so one presentation was
    // handed to both presenters, and the second call's onAbort/timeout were silently dropped.
    // See https://trello.com/c/Gq589zwz; the full behaviour is covered in
    // gateRegistrationLifecycle.test.ts.
    it('replaces the previous registration when the same baseUrl is registered again', async () => {
      mockNativeModule.onCampaignPresent.mockReturnValue({remove: jest.fn()});

      await Amply.registerGate('stillframe://ad', jest.fn());
      await Amply.registerGate('stillframe://ad', jest.fn(), {timeoutMs: 5000});

      expect(mockNativeModule.unregisterGate).toHaveBeenCalledWith('stillframe://ad');
      expect(mockNativeModule.registerGate).toHaveBeenLastCalledWith(
        'stillframe://ad',
        'cancel',
        5000,
      );
    });

    it('passes through onAbort and timeoutMs options', async () => {
      mockNativeModule.onCampaignPresent.mockReturnValue({remove: jest.fn()});

      await Amply.registerGate('stillframe://ad', jest.fn(), {
        onAbort: 'proceed',
        timeoutMs: 8000,
      });

      expect(mockNativeModule.registerGate).toHaveBeenCalledWith('stillframe://ad', 'proceed', 8000);
    });

    it('delivers params + info to the presenter and forwards completed', async () => {
      let emit: ((e: CampaignPresentEvent) => void) | undefined;
      mockNativeModule.onCampaignPresent.mockImplementation(
        (listener: (e: CampaignPresentEvent) => void) => {
          emit = listener;
          return {remove: jest.fn()};
        },
      );

      const presenter = jest.fn(
        (_params, _info, resolution: Amply.GateResolution) => resolution.completed(),
      );
      await Amply.registerGate('stillframe://ad', presenter);

      expect(emit).toBeDefined();
      emit!({
        url: 'stillframe://ad?adUnit=rewarded_main',
        params: {adUnit: 'rewarded_main'},
        info: {campaignId: 'c1'},
        mediationId: 'm1',
      });

      await flushMicrotasks();

      expect(presenter).toHaveBeenCalledWith(
        {adUnit: 'rewarded_main'},
        {campaignId: 'c1'},
        expect.any(Object),
      );
      expect(mockNativeModule.resolveCampaign).toHaveBeenCalledWith('m1', 'Completed');
    });

    it('forwards a dismissed resolution', async () => {
      let emit: ((e: CampaignPresentEvent) => void) | undefined;
      mockNativeModule.onCampaignPresent.mockImplementation(
        (listener: (e: CampaignPresentEvent) => void) => {
          emit = listener;
          return {remove: jest.fn()};
        },
      );

      await Amply.registerGate('stillframe://ad', (_p, _i, resolution) =>
        resolution.dismissed(),
      );

      emit!({url: 'stillframe://ad', params: {}, info: {}, mediationId: 'm2'});
      await flushMicrotasks();

      expect(mockNativeModule.resolveCampaign).toHaveBeenCalledWith('m2', 'Dismissed');
    });

    it('reports Unavailable (fail-open) when the presenter throws', async () => {
      let emit: ((e: CampaignPresentEvent) => void) | undefined;
      mockNativeModule.onCampaignPresent.mockImplementation(
        (listener: (e: CampaignPresentEvent) => void) => {
          emit = listener;
          return {remove: jest.fn()};
        },
      );

      await Amply.registerGate('stillframe://ad', () => {
        throw new Error('presenter blew up');
      });

      emit!({url: 'stillframe://ad', params: {}, info: {}, mediationId: 'm3'});
      await flushMicrotasks();

      expect(mockNativeModule.resolveCampaign).toHaveBeenCalledWith('m3', 'Unavailable');
    });

    it('resolves at most once even if the presenter reports twice', async () => {
      let emit: ((e: CampaignPresentEvent) => void) | undefined;
      mockNativeModule.onCampaignPresent.mockImplementation(
        (listener: (e: CampaignPresentEvent) => void) => {
          emit = listener;
          return {remove: jest.fn()};
        },
      );

      await Amply.registerGate('stillframe://ad', (_p, _i, resolution) => {
        resolution.completed();
        resolution.dismissed();
      });

      emit!({url: 'stillframe://ad', params: {}, info: {}, mediationId: 'm4'});
      await flushMicrotasks();

      expect(mockNativeModule.resolveCampaign).toHaveBeenCalledTimes(1);
      expect(mockNativeModule.resolveCampaign).toHaveBeenCalledWith('m4', 'Completed');
    });

    it('ignores dispatches whose url does not match the registered baseUrl', async () => {
      let emit: ((e: CampaignPresentEvent) => void) | undefined;
      mockNativeModule.onCampaignPresent.mockImplementation(
        (listener: (e: CampaignPresentEvent) => void) => {
          emit = listener;
          return {remove: jest.fn()};
        },
      );

      const presenter = jest.fn();
      await Amply.registerGate('stillframe://ad', presenter);

      emit!({url: 'other://thing', params: {}, info: {}, mediationId: 'm5'});
      await flushMicrotasks();

      expect(presenter).not.toHaveBeenCalled();
      expect(mockNativeModule.resolveCampaign).not.toHaveBeenCalled();
    });
  });
});
