package tools.amply.sdk.reactnative.model

/**
 * A deep link emitted by an Amply campaign.
 *
 * As of the campaign->app action contract, the KMP SDK enriches `info` with the
 * decoupled action keys (in addition to any campaign-authored content):
 * - `url`                   — routing URL
 * - `campaignId`            — id of the matched campaign
 * - `campaignName`          — name of the matched campaign
 * - `triggeringEvent`       — the event name that triggered the action
 * - `triggeringProperties`  — the properties of the triggering event (Map)
 * - `content`               — opaque, campaign-authored content passthrough (Map)
 *
 * The keys are carried inside [info]; older campaigns that only supplied a URL still
 * round-trip unchanged (the extra keys are simply absent).
 */
data class DeepLinkPayload(
  val sequenceId: Long,
  val url: String,
  val info: Map<String, Any?>,
  val consumed: Boolean,
)
