package tools.amply.sdk.reactnative

import android.app.Application
import tools.amply.sdk.reactnative.core.AmplyClient
import tools.amply.sdk.reactnative.core.DefaultAmplyClient
import tools.amply.sdk.reactnative.model.AmplyInitializationOptions
import tools.amply.sdk.reactnative.model.DataSetType
import tools.amply.sdk.reactnative.model.DataSetType.EventParam
import tools.amply.sdk.reactnative.model.DataSetType.Events
import tools.amply.sdk.reactnative.model.DataSetType.TriggeredEvent
import tools.amply.sdk.reactnative.model.EventEnvelope
import tools.amply.sdk.reactnative.NativeAmplyModuleSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Dynamic
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import com.facebook.soloader.SoLoader

class AmplyModule(reactContext: ReactApplicationContext) :
  NativeAmplyModuleSpec(reactContext), LifecycleEventListener {

  private val client: AmplyClient =
    DefaultAmplyClient(reactApplicationContext.applicationContext as Application)
  private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

  private var deepLinkJob: Job? = null
  private var lastEmittedDeepLinkId: Long? = null
  private var lifecycleRegistered = false
  private var systemEventsJob: Job? = null

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    if (!lifecycleRegistered) {
      reactApplicationContext.addLifecycleEventListener(this)
      lifecycleRegistered = true
    }
    client.onHostResume(reactApplicationContext.currentActivity)
  }

  // ---- methods, объявленные в NativeAmplyModuleSpec, реализация твоя ----

  override fun initialize(config: ReadableMap, promise: Promise) {
    scope.launch {
      try {
        client.initialize(config.toInitializationOptions())
        ensureSystemEventCollection()
        promise.resolve(null)
      } catch (throwable: Throwable) {
        promise.reject(INIT_ERROR, throwable)
      }
    }
  }

  override fun isInitialized(): Boolean = client.isInitialized()

  override fun track(payload: ReadableMap, promise: Promise) {
    val name = payload.getString("name")
    if (name.isNullOrBlank()) {
      promise.reject(ARGUMENT_ERROR, "Event 'name' is required")
      return
    }

    val properties = payload.getMap("properties")?.toHashMap()

    scope.launch {
      try {
        client.track(name, properties)
        promise.resolve(null)
      } catch (throwable: Throwable) {
        promise.reject(TRACK_ERROR, throwable)
      }
    }
  }

  override fun getRecentEvents(limit: Double, promise: Promise) {
    scope.launch {
      try {
        val events = client.getRecentEvents(limit.toInt())
        promise.resolve(events.toWritableArray())
      } catch (throwable: Throwable) {
        promise.reject(EVENTS_ERROR, throwable)
      }
    }
  }

  override fun getDataSetSnapshot(type: ReadableMap, promise: Promise) {
    val datasetType = try {
      type.toDataSetType()
    } catch (error: IllegalArgumentException) {
      promise.reject(ARGUMENT_ERROR, error)
      return
    }

    scope.launch {
      try {
        val snapshot = client.getDataSetSnapshot(datasetType)
        promise.resolve(snapshot.toWritableMap())
      } catch (throwable: Throwable) {
        promise.reject(DATASET_ERROR, throwable)
      }
    }
  }

  override fun registerDeepLinkListener() {
    if (deepLinkJob == null) {
      deepLinkJob = scope.launch {
        client.deepLinkEvents.collectLatest { payload ->
          if (payload.sequenceId == lastEmittedDeepLinkId) {
            return@collectLatest
          }
          lastEmittedDeepLinkId = payload.sequenceId
          android.util.Log.i(
            TAG,
            "Emitting deep link to JS sequenceId=${payload.sequenceId} url=${payload.url}"
          )
          emitDeepLink(payload.url, payload.info, payload.consumed)
        }
      }
      android.util.Log.i(TAG, "Started deep link collection job")
    }
    client.registerDeepLinkListener()
  }

  override fun addListener(eventName: String) {
    // Required by RN EventEmitter contracts. The native TurboModule infrastructure
    // handles the actual listener bookkeeping through the C++ event emitter.
    // This method is called by the TurboModule infrastructure but we don't need
    // to do anything here as event emission is managed at the C++ level.
    android.util.Log.d(TAG, "addListener called for event: $eventName")
  }

  override fun removeListeners(count: Double) {
    // Required by RN EventEmitter contracts. The native TurboModule infrastructure
    // handles removing listeners through the C++ event emitter.
    // This is called when JavaScript explicitly removes listeners.
    android.util.Log.d(TAG, "removeListeners called with count: $count")
  }

  // ---- lifecycle / cleanup ----

  override fun invalidate() {
    super.invalidate()
    if (lifecycleRegistered) {
      reactApplicationContext.removeLifecycleEventListener(this)
      lifecycleRegistered = false
    }
    scope.cancel()
    deepLinkJob = null
    systemEventsJob?.cancel()
    systemEventsJob = null
    lastEmittedDeepLinkId = null
    client.shutdown()
  }

  private fun emitDeepLink(url: String, info: Map<String, Any?>, consumed: Boolean) {
    val map = Arguments.createMap().apply {
      putString("url", url)
      putMap("info", info.toWritableMap())
      putBoolean("consumed", consumed)
    }
    // метод emitOnDeepLink приходит из NativeAmplyModuleSpec (codegen)
    android.util.Log.d(TAG, "emitDeepLink called: url=$url, consumed=$consumed")
    emitOnDeepLink(map)
    android.util.Log.d(TAG, "emitOnDeepLink completed")
  }

  private fun emitSystemEvent(event: EventEnvelope) {
    emitOnSystemEvent(event.toWritableMap())
  }

  private fun ensureSystemEventCollection() {
    if (systemEventsJob == null) {
      systemEventsJob = scope.launch {
        client.systemEvents.collectLatest { event ->
          emitSystemEvent(event)
        }
      }
      client.registerSystemEventListener()
    }
  }

  // ---- твои helper-методы без изменений ----

  private fun ReadableMap.toInitializationOptions(): AmplyInitializationOptions {
    val appId = getString("appId") ?: throw IllegalArgumentException("'appId' is required")
    val apiKeyPublic = getString("apiKeyPublic") ?: throw IllegalArgumentException("'apiKeyPublic' is required")

    val apiKeySecret = if (hasKey("apiKeySecret")) getString("apiKeySecret") else null
    val endpoint = if (hasKey("endpoint")) getString("endpoint") else null
    val datasetPrefetch = if (hasKey("datasetPrefetch")) {
      getArray("datasetPrefetch")?.toDataSetTypes()
    } else {
      null
    }
    val defaultConfig = if (hasKey("defaultConfig")) getString("defaultConfig") else null

    return AmplyInitializationOptions(
      appId = appId,
      apiKeyPublic = apiKeyPublic,
      apiKeySecret = apiKeySecret,
      endpoint = endpoint,
      datasetPrefetch = datasetPrefetch,
      defaultConfig = defaultConfig,
    )
  }

  private fun ReadableArray.toDataSetTypes(): List<DataSetType> = buildList {
    for (index in 0 until size()) {
      val map = getMap(index) ?: continue
      add(map.toDataSetType())
    }
  }

  private fun ReadableMap.toDataSetType(): DataSetType {
    val kind = getString("kind") ?: throw IllegalArgumentException("DataSetType.kind is required")
    return when (kind) {
      "@device" -> DataSetType.Device
      "@user" -> DataSetType.User
      "@session" -> DataSetType.Session
      "@triggeredEvent" -> {
        val data = getMap("data") ?: throw IllegalArgumentException("TriggeredEvent data is required")
        val countStrategy = TriggeredEvent.CountStrategy.fromWireName(data.getString("countStrategy"))
          ?: throw IllegalArgumentException("TriggeredEvent.countStrategy is required")
        val params = data.getArray("params")?.toEventParams().orEmpty()
        val eventName = if (data.hasKey("eventName")) data.getString("eventName") else null
        DataSetType.TriggeredEvent(countStrategy, params, eventName)
      }
      "@events" -> {
        val data = getArray("data") ?: throw IllegalArgumentException("Events data list is required")
        DataSetType.Events(data.toEvents())
      }
      else -> throw IllegalArgumentException("Unsupported DataSetType kind: $kind")
    }
  }

  private fun ReadableArray.toEventParams(): List<EventParam> = buildList {
    for (index in 0 until size()) {
      val map = getMap(index) ?: continue
      val name = map.getString("name") ?: continue
      val value = if (map.hasKey("value")) map.getDynamic("value")?.toAny() else null
      add(EventParam(name, value))
    }
  }

  private fun ReadableArray.toEvents(): List<Events.Event> = buildList {
    for (index in 0 until size()) {
      val map = getMap(index) ?: continue
      val name = map.getString("name") ?: continue
      val type = Events.EventType.fromWireName(map.getString("type")) ?: Events.EventType.CUSTOM
      val params = map.getArray("params")?.toEventParams().orEmpty()
      add(Events.Event(name, type, params))
    }
  }

  private fun EventEnvelope.toWritableMap(): WritableMap =
    Arguments.createMap().apply {
      id?.let { putString("id", it) }
      putString("name", name)
      putString("type", type)
      putDouble("timestamp", timestamp.toDouble())
      putMap("properties", properties.toWritableMap())
    }

  private fun List<EventEnvelope>.toWritableArray(): WritableArray {
    val array = Arguments.createArray()
    forEach { event ->
      array.pushMap(event.toWritableMap())
    }
    return array
  }

  private fun Map<String, Any?>.toWritableMap(): WritableMap = Arguments.createMap().also { map ->
    forEach { (key, value) -> map.putDynamic(key, value) }
  }

  private fun List<*>.toWritableDynamicArray(): WritableArray = Arguments.createArray().also { array ->
    forEach { array.pushDynamic(it) }
  }

  private fun WritableMap.putDynamic(key: String, value: Any?) {
    when (value) {
      null -> putNull(key)
      is Boolean -> putBoolean(key, value)
      is Number -> putDouble(key, value.toDouble())
      is String -> putString(key, value)
      is Map<*, *> -> putMap(key, (value as? Map<String, Any?>)?.toWritableMap())
      is List<*> -> putArray(key, value.toWritableDynamicArray())
      else -> putString(key, value.toString())
    }
  }

  private fun WritableArray.pushDynamic(value: Any?) {
    when (value) {
      null -> pushNull()
      is Boolean -> pushBoolean(value)
      is Number -> pushDouble(value.toDouble())
      is String -> pushString(value)
      is Map<*, *> -> pushMap((value as? Map<String, Any?>)?.toWritableMap())
      is List<*> -> pushArray(value.toWritableDynamicArray())
      else -> pushString(value.toString())
    }
  }

  private fun Dynamic.toAny(): Any? =
    when (type) {
      ReadableType.Null -> null
      ReadableType.Boolean -> asBoolean()
      ReadableType.Number -> asDouble().toNormalizedNumber()
      ReadableType.String -> asString()
      ReadableType.Map -> asMap()?.toHashMap()
      ReadableType.Array -> asArray()?.toNativeList()
      else -> null
    }

  private fun ReadableArray.toNativeList(): List<Any?> = buildList {
    for (index in 0 until size()) {
      add(
        when (getType(index)) {
          ReadableType.Null -> null
          ReadableType.Boolean -> getBoolean(index)
          ReadableType.Number -> getDouble(index).toNormalizedNumber()
          ReadableType.String -> getString(index)
          ReadableType.Map -> getMap(index)?.toHashMap()
          ReadableType.Array -> getArray(index)?.toNativeList()
          else -> null
        }
      )
    }
  }

  private fun Double.toNormalizedNumber(): Number {
    val longValue = toLong()
    return if (this == longValue.toDouble()) {
      if (longValue in Int.MIN_VALUE..Int.MAX_VALUE) longValue.toInt() else longValue
    } else {
      this
    }
  }

  // ---- LifecycleEventListener ----

  override fun onHostResume() {
    client.onHostResume(reactApplicationContext.currentActivity)
  }

  override fun onHostPause() {
    // No-op; Amply session tracker responds to primed lifecycle callbacks.
  }

  override fun onHostDestroy() {
    // No-op.
  }

  companion object {
    init {
      SoLoader.loadLibrary("AmplyReactNative")
    }

    // ВАЖНО: это имя должно совпадать с тем, что запрашивает JS через TurboModuleRegistry.get(...)
    const val NAME = "Amply"
    private const val TAG = "AmplyReactNative"

    private const val INIT_ERROR = "AMP_INIT_FAILED"
    private const val ARGUMENT_ERROR = "AMP_INVALID_ARGUMENT"
    private const val TRACK_ERROR = "AMP_TRACK_FAILED"
    private const val EVENTS_ERROR = "AMP_EVENTS_FAILED"
    private const val DATASET_ERROR = "AMP_DATASET_FAILED"
  }
}
