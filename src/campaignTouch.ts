import type {CampaignTouchPayload} from './nativeSpecs/NativeAmplyModule';

/**
 * - `'shown'`: the campaign was shown (`CampaignShown`).
 * - `'engaged'`: the campaign resolved `Completed` (`CampaignResolved` with `result: 'Completed'`).
 */
export type CampaignTouchKind = 'shown' | 'engaged';

/**
 * The most recent moment a campaign reached the user, as answered by `getLastCampaignTouch`.
 *
 * Meant for your own analytics: attach `campaignId` / `campaignName` to a purchase (or any
 * conversion) that happens shortly after a campaign, even when it did not start from the
 * campaign's own link.
 */
export type CampaignTouch = {
  /**
   * The id the SDK reports in `CampaignShown`. Inside an experiment that is the arm's own id —
   * the same value `{@campaign.id}` resolves to, so it is also the right value for an explicit
   * `amply_campaign_id` mark.
   */
  campaignId: string;
  /** The campaign's name when the touch was recorded. Empty if the event carried no name. */
  campaignName: string;
  /** One touch per campaign: the newer of a show and a completion wins. */
  kind: CampaignTouchKind;
  /** When it happened, epoch milliseconds in the SDK's server-corrected clock. */
  atMs: number;
};

/** Thrown (as a rejection) by `getLastCampaignTouch` for a window that is not a usable number. */
export function assertValidWithinMs(withinMs: unknown): asserts withinMs is number {
  if (typeof withinMs !== 'number' || !Number.isFinite(withinMs) || withinMs < 0) {
    throw new RangeError(
      `[Amply] getLastCampaignTouch: withinMs must be a finite number >= 0, got ${String(withinMs)}`,
    );
  }
}

function toKind(raw: unknown): CampaignTouchKind | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const lowered = raw.toLowerCase();
  return lowered === 'shown' || lowered === 'engaged' ? lowered : null;
}

/**
 * Narrows what the native bridge resolved to the public type. Anything it cannot read as a
 * touch becomes null with a warning: the caller asked "was there a campaign", and a payload this
 * bridge does not understand is not one it can vouch for.
 */
export function toCampaignTouch(payload: CampaignTouchPayload | null | undefined): CampaignTouch | null {
  if (payload == null) {
    return null;
  }
  const kind = toKind(payload.kind);
  const isReadable =
    kind !== null &&
    typeof payload.campaignId === 'string' &&
    payload.campaignId.length > 0 &&
    typeof payload.atMs === 'number' &&
    Number.isFinite(payload.atMs);
  if (!isReadable) {
    console.warn('[Amply] getLastCampaignTouch: ignoring an unreadable native payload', payload);
    return null;
  }
  return {
    campaignId: payload.campaignId,
    campaignName: typeof payload.campaignName === 'string' ? payload.campaignName : '',
    kind,
    atMs: payload.atMs,
  };
}
