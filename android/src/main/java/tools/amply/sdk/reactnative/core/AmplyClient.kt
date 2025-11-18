package tools.amply.sdk.reactnative.core

import android.app.Activity
import tools.amply.sdk.reactnative.model.AmplyInitializationOptions
import tools.amply.sdk.reactnative.model.DataSetType
import tools.amply.sdk.reactnative.model.DeepLinkPayload
import tools.amply.sdk.reactnative.model.EventEnvelope
import kotlinx.coroutines.flow.SharedFlow

interface AmplyClient {
  val deepLinkEvents: SharedFlow<DeepLinkPayload>
  val systemEvents: SharedFlow<EventEnvelope>

  suspend fun initialize(options: AmplyInitializationOptions)

  fun isInitialized(): Boolean

  suspend fun track(name: String, properties: Map<String, Any?>?)

  suspend fun getRecentEvents(limit: Int): List<EventEnvelope>

  suspend fun getDataSetSnapshot(type: DataSetType): Map<String, Any?>

  fun registerDeepLinkListener()
  fun registerSystemEventListener()

  fun onHostResume(activity: Activity?)

  fun shutdown()
}
