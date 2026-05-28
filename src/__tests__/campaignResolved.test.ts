import * as Amply from '../index';
import {__setNativeModule} from '../nativeModule';

type CampaignPresentEvent = {url: string; info: Record<string, unknown>; mediationId: string};

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
  trackEventGated: jest.fn(),
  resolveCampaign: jest.fn(),
  getRecentEvents: jest.fn(),
  getDataSetSnapshot: jest.fn(),
  registerDeepLinkListener: jest.fn(),
  registerCampaignPresenter: jest.fn(),
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

describe('Amply CampaignResolved present/resolve/result API', () => {
  afterEach(() => {
    jest.clearAllMocks();
    __setNativeModule(null);
  });

  beforeEach(() => {
    __setNativeModule(mockNativeModule as never);
  });

  describe('trackEvent continuation overload', () => {
    it('calls fire-and-forget track when no callbacks are supplied', async () => {
      await Amply.trackEvent('SaveTapped', {foo: 'bar'});

      expect(mockNativeModule.track).toHaveBeenCalledWith({
        name: 'SaveTapped',
        properties: {foo: 'bar'},
      });
      expect(mockNativeModule.trackEventGated).not.toHaveBeenCalled();
    });

    it('routes a "complete" resolution to onProceed', async () => {
      mockNativeModule.trackEventGated.mockResolvedValueOnce('complete');

      const onProceed = jest.fn();
      const onCancel = jest.fn();

      await Amply.trackEvent('SaveTapped', {foo: 'bar'}, {onProceed, onCancel});

      expect(mockNativeModule.trackEventGated).toHaveBeenCalledWith('SaveTapped', {
        foo: 'bar',
      });
      expect(onProceed).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('routes a "cancel" resolution to onCancel', async () => {
      mockNativeModule.trackEventGated.mockResolvedValueOnce('cancel');

      const onProceed = jest.fn();
      const onCancel = jest.fn();

      await Amply.trackEvent('SaveTapped', undefined, {onProceed, onCancel});

      expect(mockNativeModule.trackEventGated).toHaveBeenCalledWith('SaveTapped', {});
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onProceed).not.toHaveBeenCalled();
    });

    it('fails open to onProceed when the native call rejects', async () => {
      mockNativeModule.trackEventGated.mockRejectedValueOnce(new Error('boom'));

      const onProceed = jest.fn();
      const onCancel = jest.fn();

      await Amply.trackEvent('SaveTapped', {}, {onProceed, onCancel});

      expect(onProceed).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('runs onProceed (not onCancel) for "cancel" when no onCancel is supplied', async () => {
      mockNativeModule.trackEventGated.mockResolvedValueOnce('cancel');

      const onProceed = jest.fn();

      await Amply.trackEvent('SaveTapped', {}, {onProceed});

      // The raw result is never exposed; a "cancel" with no onCancel hook is a no-op
      // for the continuation. onProceed must not fire on a cancel.
      expect(onProceed).not.toHaveBeenCalled();
    });
  });

  describe('registerCampaignPresenter', () => {
    it('registers once on the native module and subscribes to onCampaignPresent', async () => {
      const remove = jest.fn();
      mockNativeModule.onCampaignPresent.mockReturnValue({remove});

      const presenter = jest.fn(() => 'Completed' as const);
      const unsubscribe = await Amply.registerCampaignPresenter(presenter);

      expect(mockNativeModule.registerCampaignPresenter).toHaveBeenCalledTimes(1);
      expect(mockNativeModule.onCampaignPresent).toHaveBeenCalledTimes(1);

      unsubscribe();
      expect(remove).toHaveBeenCalledTimes(1);
    });

    it('forwards a synchronous result to resolveCampaign', async () => {
      let emit: ((e: CampaignPresentEvent) => void) | undefined;
      mockNativeModule.onCampaignPresent.mockImplementation((listener: (e: CampaignPresentEvent) => void) => {
        emit = listener;
        return {remove: jest.fn()};
      });

      const presenter = jest.fn(() => 'Dismissed' as const);
      await Amply.registerCampaignPresenter(presenter);

      expect(emit).toBeDefined();
      emit!({url: 'stillframe://ad', info: {campaignId: 'c1'}, mediationId: 'm1'});

      // allow the (possibly async) presenter resolution to flush
      await flushMicrotasks();

      expect(presenter).toHaveBeenCalledWith('stillframe://ad', {campaignId: 'c1'});
      expect(mockNativeModule.resolveCampaign).toHaveBeenCalledWith('m1', 'Dismissed');
    });

    it('forwards a promise-resolved result to resolveCampaign', async () => {
      let emit: ((e: CampaignPresentEvent) => void) | undefined;
      mockNativeModule.onCampaignPresent.mockImplementation((listener: (e: CampaignPresentEvent) => void) => {
        emit = listener;
        return {remove: jest.fn()};
      });

      const presenter = jest.fn(async () => 'Unavailable' as const);
      await Amply.registerCampaignPresenter(presenter);

      emit!({url: 'stillframe://ad', info: {}, mediationId: 'm2'});

      await flushMicrotasks();

      expect(mockNativeModule.resolveCampaign).toHaveBeenCalledWith('m2', 'Unavailable');
    });

    it('reports Unavailable (fail-open) when the presenter throws', async () => {
      let emit: ((e: CampaignPresentEvent) => void) | undefined;
      mockNativeModule.onCampaignPresent.mockImplementation((listener: (e: CampaignPresentEvent) => void) => {
        emit = listener;
        return {remove: jest.fn()};
      });

      const presenter = jest.fn(() => {
        throw new Error('presenter blew up');
      });
      await Amply.registerCampaignPresenter(presenter);

      emit!({url: 'stillframe://ad', info: {}, mediationId: 'm3'});

      await flushMicrotasks();

      expect(mockNativeModule.resolveCampaign).toHaveBeenCalledWith('m3', 'Unavailable');
    });
  });
});
