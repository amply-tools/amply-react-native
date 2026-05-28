package tools.amply.sdk.reactnative.core

import android.app.Activity
import tools.amply.sdk.reactnative.model.AmplyInitializationOptions
import tools.amply.sdk.reactnative.model.DataSetType
import tools.amply.sdk.reactnative.model.DeepLinkPayload
import tools.amply.sdk.reactnative.model.EventEnvelope
import tools.amply.sdk.reactnative.model.LogLevel
import tools.amply.sdk.reactnative.model.CampaignPresentPayload
import kotlinx.coroutines.flow.SharedFlow

interface AmplyClient {
  val deepLinkEvents: SharedFlow<DeepLinkPayload>
  val systemEvents: SharedFlow<EventEnvelope>
  val logEvents: SharedFlow<EventEnvelope>

  /**
   * Stream of campaign present (blocking) action dispatches awaiting a JS-reported result.
   * Each emission carries a unique `mediationId` to be echoed back via
   * [resolveCampaign].
   */
  val campaignPresents: SharedFlow<CampaignPresentPayload>

  suspend fun initialize(options: AmplyInitializationOptions)

  fun isInitialized(): Boolean

  suspend fun track(name: String, properties: Map<String, Any?>?)

  /**
   * Gated form of track. Wraps the KMP `trackEvent` continuation overload:
   * records the event, evaluates campaigns, and (if a blocking action matched and a
   * presenter is registered) dispatches the campaign present and awaits its result
   * before invoking exactly one of [onProceed] / [onCancel]. Fails open to
   * [onProceed] on every error path.
   */
  fun trackEventGated(
    name: String,
    properties: Map<String, Any?>?,
    onProceed: () -> Unit,
    onCancel: () -> Unit,
  )

  /**
   * Register the bridge's JS-backed campaign presenter with the KMP SDK so a
   * dispatched blocking action is surfaced to JS via [campaignPresents].
   */
  fun registerCampaignPresenter()

  /**
   * Report the terminal result (one of `Completed` / `Dismissed` / `Unavailable`) for
   * a previously dispatched campaign present. Idempotent — late/duplicate or unknown
   * `mediationId`s are ignored.
   */
  fun resolveCampaign(mediationId: String, result: String)

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
