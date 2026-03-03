package tools.amply.sdk.reactnative.core

import android.app.Activity
import tools.amply.sdk.reactnative.model.AmplyInitializationOptions
import tools.amply.sdk.reactnative.model.DataSetType
import tools.amply.sdk.reactnative.model.DeepLinkPayload
import tools.amply.sdk.reactnative.model.EventEnvelope
import tools.amply.sdk.reactnative.model.LogLevel
import kotlinx.coroutines.flow.SharedFlow

interface AmplyClient {
  val deepLinkEvents: SharedFlow<DeepLinkPayload>
  val systemEvents: SharedFlow<EventEnvelope>
  val logEvents: SharedFlow<EventEnvelope>

  suspend fun initialize(options: AmplyInitializationOptions)

  fun isInitialized(): Boolean

  suspend fun track(name: String, properties: Map<String, Any?>?)

  suspend fun getRecentEvents(limit: Int): List<EventEnvelope>

  suspend fun getDataSetSnapshot(type: DataSetType): Map<String, Any?>

  fun registerDeepLinkListener()
  fun registerSystemEventListener()

  fun setUserId(userId: String?)

  fun setLogLevel(level: LogLevel)
  fun getLogLevel(): LogLevel

  fun setCustomProperty(key: String, value: Any)
  fun setCustomProperties(properties: Map<String, Any?>)
  fun removeCustomProperty(key: String)
  fun clearCustomProperties()
  suspend fun getCustomProperty(key: String): Any?

  fun onHostResume(activity: Activity?)

  fun shutdown()
}
