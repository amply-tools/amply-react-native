package tools.amply.sdk.reactnative.model

/**
 * The bridge's copy of the SDK's `CampaignTouch`, with [kind] already in its JS spelling
 * (`"shown"` / `"engaged"`).
 */
data class CampaignTouchPayload(
  val campaignId: String,
  val campaignName: String,
  val kind: String,
  val atMs: Long,
)
