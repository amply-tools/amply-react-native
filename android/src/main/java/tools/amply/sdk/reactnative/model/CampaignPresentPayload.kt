package tools.amply.sdk.reactnative.model

/**
 * A gate (blocking) presentation that has been dispatched to the JS layer and is
 * awaiting a terminal result reported back via `resolveCampaign`.
 *
 * `mediationId` is the SDK-minted token correlating the dispatch with the JS reply;
 * `params` carries the parsed query parameters of the gate action URL;
 * `info` carries the enriched, decoupled action info
 * (`url`, `campaignId`, `campaignName`, `triggeringEvent`, `triggeringProperties`, `content`).
 */
data class CampaignPresentPayload(
  val sequenceId: Long,
  val mediationId: String,
  val url: String,
  val params: Map<String, Any?>,
  val info: Map<String, Any?>,
)
