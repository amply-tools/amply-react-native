package tools.amply.sdk.reactnative.model

data class DeepLinkPayload(
  val sequenceId: Long,
  val url: String,
  val info: Map<String, Any?>,
  val consumed: Boolean,
)
