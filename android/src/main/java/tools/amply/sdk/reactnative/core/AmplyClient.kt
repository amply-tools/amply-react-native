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
   * Gated form of track. Wraps the KMP `suspend fun trackGated(event, props): GateDecision`:
   * records the event, evaluates campaigns, and (if a gate action matched and a presenter
   * is registered) dispatches the gate presentation and awaits its outcome. Returns the
   * collapsed [GateDecision]. Never throws — every error path returns
   * [GateDecision.Proceed] with reason [GateDecision.ProceedReason.FAIL_OPEN].
   */
  suspend fun trackGated(
    name: String,
    properties: Map<String, Any?>?,
  ): GateDecision

  /**
   * Register the bridge's JS-backed gate presenter with the KMP SDK for [baseUrl], so a
   * dispatched gate presentation is surfaced to JS via [campaignPresents].
   *
   * @param onAbort `"cancel"` or `"proceed"`.
   * @param timeoutMs gate timeout in ms; `0` means use the SDK default.
   */
  fun registerGate(baseUrl: String, onAbort: String, timeoutMs: Long)

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
