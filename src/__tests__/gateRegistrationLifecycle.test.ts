import * as Amply from '../index';
import {__setNativeModule} from '../nativeModule';

type CampaignPresentEvent = {
  url: string;
  params: Record<string, unknown>;
  info: Record<string, unknown>;
  mediationId: string;
};

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

/**
 * The registration lifecycle of a gate: who receives a presentation, what withdrawal
 * actually withdraws, and what happens to a registration made before the SDK is up.
 *
 * All three were found on 2026-07-31 — the first two by reading the bridge after a field
 * report on Happens, the third by the field report itself. They share one cause: the JS side
 * keeps its own record of what is registered natively, and that record was written
 * optimistically and never reconciled.
 *
 * Trello: gate eviction https://trello.com/c/Gq589zwz, withdrawal
 * https://trello.com/c/saf8I9c6, pre-init registration https://trello.com/c/TZCixnYi
 */
describe('gate registration lifecycle', () => {
  /** Every listener currently attached to the shared onCampaignPresent channel. */
  let emitters: Array<(e: CampaignPresentEvent) => void>;

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

  beforeEach(() => {
    emitters = [];
    mockNativeModule.isInitialized.mockReturnValue(true);
    mockNativeModule.onCampaignPresent.mockImplementation(
      (listener: (e: CampaignPresentEvent) => void) => {
        emitters.push(listener);
        // `remove` must actually detach, as a real RN subscription does — otherwise this
        // harness reports a listener as live after it was removed, and every eviction and
        // withdrawal assertion below would be measuring the mock rather than the code.
        const remove = jest.fn(() => {
          const at = emitters.indexOf(listener);
          if (at >= 0) {
            emitters.splice(at, 1);
          }
        });
        return {remove};
      },
    );
    mockNativeModule.onDeepLink.mockReturnValue({remove: jest.fn()});
    __setNativeModule(mockNativeModule as never);
  });

  afterEach(() => {
    Amply.removeAllListeners();
    jest.clearAllMocks();
    __setNativeModule(null);
  });

  /** Delivers one presentation to every listener currently subscribed to the channel. */
  function emitPresentation(mediationId = 'm1'): void {
    const event: CampaignPresentEvent = {
      url: 'stillframe://ad?adUnit=main',
      params: {adUnit: 'main'},
      info: {campaignId: 'c1'},
      mediationId,
    };
    emitters.forEach(emit => emit(event));
  }

  describe('a second registration on the same baseUrl (Gq589zwz)', () => {
    it('leaves exactly one live presenter, not two', async () => {
      const first = jest.fn((_p, _i, r: Amply.GateResolution) => r.completed());
      const second = jest.fn((_p, _i, r: Amply.GateResolution) => r.completed());

      await Amply.registerGate('stillframe://ad', first);
      await Amply.registerGate('stillframe://ad', second);

      emitPresentation();
      await flushMicrotasks();

      // Both presenters showing UI for one presentation is the defect: the outcome is then
      // decided by whichever reported first, and the loser's UI is orphaned on screen.
      expect(second).toHaveBeenCalledTimes(1);
      expect(first).not.toHaveBeenCalled();
    });

    it('applies the options of the newest registration', async () => {
      await Amply.registerGate('stillframe://ad', jest.fn(), {
        onAbort: 'cancel',
        timeoutMs: 1000,
      });
      await Amply.registerGate('stillframe://ad', jest.fn(), {
        onAbort: 'proceed',
        timeoutMs: 8000,
      });

      // Previously the second call was a no-op natively, so its onAbort and timeout were
      // silently discarded and the gate kept running under the first call's policy.
      expect(mockNativeModule.registerGate).toHaveBeenLastCalledWith(
        'stillframe://ad',
        'proceed',
        8000,
      );
    });

    it('keeps gates on different baseUrls independent', async () => {
      const ad = jest.fn((_p, _i, r: Amply.GateResolution) => r.completed());
      const paywall = jest.fn((_p, _i, r: Amply.GateResolution) => r.completed());

      await Amply.registerGate('stillframe://ad', ad);
      await Amply.registerGate('stillframe://paywall', paywall);

      emitPresentation();
      await flushMicrotasks();

      // Only the URL-matching presenter runs; evicting by baseUrl must not evict a sibling.
      expect(ad).toHaveBeenCalledTimes(1);
      expect(paywall).not.toHaveBeenCalled();
    });
  });

  describe('withdrawal (saf8I9c6)', () => {
    it('withdraws the native gate, not just the JS subscription', async () => {
      const unsubscribe = await Amply.registerGate('stillframe://ad', jest.fn());

      unsubscribe();

      // Without this the gate outlives its presenter and parks the next gated call on that
      // URL for the whole fail-open timeout — silently, with no crash and no console trace.
      expect(mockNativeModule.unregisterGate).toHaveBeenCalledWith('stillframe://ad');
    });

    it('lets the same baseUrl be registered again after withdrawal', async () => {
      const unsubscribe = await Amply.registerGate('stillframe://ad', jest.fn());
      unsubscribe();

      const presenter = jest.fn((_p, _i, r: Amply.GateResolution) => r.completed());
      await Amply.registerGate('stillframe://ad', presenter);

      emitPresentation();
      await flushMicrotasks();

      expect(presenter).toHaveBeenCalledTimes(1);
    });

    /**
     * Found by codex, not by me. Withdrawal was keyed by URL alone, so an unsubscribe handed
     * out for a registration that has since been evicted still withdrew whatever holds that
     * URL now — killing its replacement. A stale handle must be inert, not destructive.
     */
    it('an evicted registration\'s unsubscribe does not withdraw its replacement', async () => {
      const withdrawFirst = await Amply.registerGate('stillframe://ad', jest.fn());

      const second = jest.fn((_p, _i, r: Amply.GateResolution) => r.completed());
      await Amply.registerGate('stillframe://ad', second);
      mockNativeModule.unregisterGate.mockClear();

      withdrawFirst();

      expect(mockNativeModule.unregisterGate).not.toHaveBeenCalled();

      emitPresentation();
      await flushMicrotasks();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it('is idempotent — a second call withdraws nothing further', async () => {
      const unsubscribe = await Amply.registerGate('stillframe://ad', jest.fn());

      unsubscribe();
      unsubscribe();

      expect(mockNativeModule.unregisterGate).toHaveBeenCalledTimes(1);
    });

    it('removeAllListeners withdraws every native gate too', async () => {
      await Amply.registerGate('stillframe://ad', jest.fn());
      await Amply.registerGate('stillframe://paywall', jest.fn());

      Amply.removeAllListeners();

      // It used to clear the JS bookkeeping only, leaving JS believing nothing was
      // registered while both gates were still live natively.
      expect(mockNativeModule.unregisterGate).toHaveBeenCalledWith('stillframe://ad');
      expect(mockNativeModule.unregisterGate).toHaveBeenCalledWith('stillframe://paywall');
    });
  });

  describe('registration before initialize (TZCixnYi)', () => {
    it('replays a gate registration once the SDK is up', async () => {
      mockNativeModule.isInitialized.mockReturnValue(false);

      const presenter = jest.fn((_p, _i, r: Amply.GateResolution) => r.completed());
      await Amply.registerGate('stillframe://ad', presenter);

      // Native refuses while uninitialised; JS must not record that as done.
      expect(mockNativeModule.registerGate).not.toHaveBeenCalled();

      mockNativeModule.isInitialized.mockReturnValue(true);
      await Amply.initialize({apiKey: 'k', apiKeySecret: 's'} as never);

      expect(mockNativeModule.registerGate).toHaveBeenCalledWith('stillframe://ad', 'cancel', 0);

      emitPresentation();
      await flushMicrotasks();
      expect(presenter).toHaveBeenCalledTimes(1);
    });

    it('replays a deeplink listener once the SDK is up', async () => {
      mockNativeModule.isInitialized.mockReturnValue(false);

      await Amply.addDeepLinkListener(jest.fn());
      expect(mockNativeModule.registerDeepLinkListener).not.toHaveBeenCalled();

      mockNativeModule.isInitialized.mockReturnValue(true);
      await Amply.initialize({apiKey: 'k', apiKeySecret: 's'} as never);

      expect(mockNativeModule.registerDeepLinkListener).toHaveBeenCalledTimes(1);
    });

    /**
     * Found by self-review, not by the original pass. Eviction ran at `registerGate()` time,
     * but a queued registration is not in the registry yet, so there was nothing to evict —
     * both attached at replay and the second overwrote the map entry without removing the
     * first subscription. That is the duplicate-presenter defect again, on the pre-init path.
     */
    it('two registrations on one baseUrl before init still leave one live presenter', async () => {
      mockNativeModule.isInitialized.mockReturnValue(false);

      const first = jest.fn((_p, _i, r: Amply.GateResolution) => r.completed());
      const second = jest.fn((_p, _i, r: Amply.GateResolution) => r.completed());
      await Amply.registerGate('stillframe://ad', first);
      await Amply.registerGate('stillframe://ad', second);

      mockNativeModule.isInitialized.mockReturnValue(true);
      await Amply.initialize({apiKey: 'k', apiKeySecret: 's'} as never);

      emitPresentation();
      await flushMicrotasks();

      expect(second).toHaveBeenCalledTimes(1);
      expect(first).not.toHaveBeenCalled();
    });

    it('withdrawing a queued gate cancels it instead of replaying it', async () => {
      mockNativeModule.isInitialized.mockReturnValue(false);

      const unsubscribe = await Amply.registerGate('stillframe://ad', jest.fn());
      unsubscribe();

      mockNativeModule.isInitialized.mockReturnValue(true);
      await Amply.initialize({apiKey: 'k', apiKeySecret: 's'} as never);

      expect(mockNativeModule.registerGate).not.toHaveBeenCalled();
    });
  });
});
