package tools.amply.sdk.reactnative.model

data class AmplyInitializationOptions(
  val appId: String,
  val apiKeyPublic: String,
  val apiKeySecret: String?,
  val endpoint: String?,
  val datasetPrefetch: List<DataSetType>?,
  val defaultConfig: String?,
)
