import * as Amply from '../index';
import {__setNativeModule} from '../nativeModule';

const mockNativeModule = {
  isInitialized: jest.fn(() => true),
  getLastCampaignTouch: jest.fn(),
};

const ONE_HOUR_MS = 60 * 60 * 1000;

describe('getLastCampaignTouch', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    __setNativeModule(mockNativeModule as never);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    jest.clearAllMocks();
    __setNativeModule(null);
  });

  it('passes withinMs through to the native module and returns the touch', async () => {
    mockNativeModule.getLastCampaignTouch.mockResolvedValueOnce({
      campaignId: 'cmp_1',
      campaignName: 'Spring offer',
      kind: 'shown',
      atMs: 1_760_000_000_000,
    });

    const touch = await Amply.getLastCampaignTouch(ONE_HOUR_MS);

    expect(mockNativeModule.getLastCampaignTouch).toHaveBeenCalledWith(ONE_HOUR_MS);
    expect(touch).toEqual({
      campaignId: 'cmp_1',
      campaignName: 'Spring offer',
      kind: 'shown',
      atMs: 1_760_000_000_000,
    });
  });

  it('is exposed on the default export too', async () => {
    mockNativeModule.getLastCampaignTouch.mockResolvedValueOnce(null);

    await expect(Amply.default.getLastCampaignTouch(0)).resolves.toBeNull();
  });

  it('resolves null when the native side has no touch', async () => {
    mockNativeModule.getLastCampaignTouch.mockResolvedValueOnce(null);

    await expect(Amply.getLastCampaignTouch(ONE_HOUR_MS)).resolves.toBeNull();
  });

  it('resolves null when the native side resolves undefined', async () => {
    mockNativeModule.getLastCampaignTouch.mockResolvedValueOnce(undefined);

    await expect(Amply.getLastCampaignTouch(ONE_HOUR_MS)).resolves.toBeNull();
  });

  it.each([
    ['shown', 'shown'],
    ['engaged', 'engaged'],
    ['SHOWN', 'shown'],
    ['ENGAGED', 'engaged'],
  ])('maps native kind %s to %s', async (nativeKind, expected) => {
    mockNativeModule.getLastCampaignTouch.mockResolvedValueOnce({
      campaignId: 'cmp_1',
      campaignName: 'Spring offer',
      kind: nativeKind,
      atMs: 1,
    });

    const touch = await Amply.getLastCampaignTouch(ONE_HOUR_MS);

    expect(touch?.kind).toBe(expected);
  });

  it('resolves null and warns for a kind this bridge does not know', async () => {
    mockNativeModule.getLastCampaignTouch.mockResolvedValueOnce({
      campaignId: 'cmp_1',
      campaignName: 'Spring offer',
      kind: 'clicked',
      atMs: 1,
    });

    await expect(Amply.getLastCampaignTouch(ONE_HOUR_MS)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('getLastCampaignTouch'), expect.anything());
  });

  it.each([
    ['a missing campaignId', {campaignName: 'x', kind: 'shown', atMs: 1}],
    ['a non-numeric atMs', {campaignId: 'c', campaignName: 'x', kind: 'shown', atMs: '1'}],
  ])('resolves null for a payload with %s', async (_label, payload) => {
    mockNativeModule.getLastCampaignTouch.mockResolvedValueOnce(payload);

    await expect(Amply.getLastCampaignTouch(ONE_HOUR_MS)).resolves.toBeNull();
  });

  it('keeps an empty campaign name rather than dropping the touch', async () => {
    mockNativeModule.getLastCampaignTouch.mockResolvedValueOnce({
      campaignId: 'cmp_1',
      campaignName: '',
      kind: 'engaged',
      atMs: 5,
    });

    await expect(Amply.getLastCampaignTouch(ONE_HOUR_MS)).resolves.toEqual({
      campaignId: 'cmp_1',
      campaignName: '',
      kind: 'engaged',
      atMs: 5,
    });
  });

  it('resolves null instead of rejecting when the native call fails', async () => {
    mockNativeModule.getLastCampaignTouch.mockRejectedValueOnce(new Error('bridge gone'));

    await expect(Amply.getLastCampaignTouch(ONE_HOUR_MS)).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('accepts zero', async () => {
    mockNativeModule.getLastCampaignTouch.mockResolvedValueOnce(null);

    await Amply.getLastCampaignTouch(0);

    expect(mockNativeModule.getLastCampaignTouch).toHaveBeenCalledWith(0);
  });

  it('leaves a large window to the native clamp', async () => {
    mockNativeModule.getLastCampaignTouch.mockResolvedValueOnce(null);
    const ninetyDaysMs = 90 * 24 * ONE_HOUR_MS;

    await Amply.getLastCampaignTouch(ninetyDaysMs);

    expect(mockNativeModule.getLastCampaignTouch).toHaveBeenCalledWith(ninetyDaysMs);
  });

  it.each([
    ['negative', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a string', '3600000'],
    ['undefined', undefined],
  ])('rejects with a RangeError for %s and never calls native', async (_label, value) => {
    await expect(Amply.getLastCampaignTouch(value as never)).rejects.toBeInstanceOf(RangeError);
    expect(mockNativeModule.getLastCampaignTouch).not.toHaveBeenCalled();
  });
});
