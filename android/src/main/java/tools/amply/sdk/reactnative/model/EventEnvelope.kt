package tools.amply.sdk.reactnative.model

data class EventEnvelope(
  val id: String?,
  val name: String,
  val type: String,
  val timestamp: Long,
  val properties: Map<String, Any?>,
)
