package tools.amply.sdk.reactnative.core

import android.app.Activity
import android.app.Application
import android.os.Handler
import android.os.Looper
import tools.amply.sdk.reactnative.model.AmplyInitializationOptions
import tools.amply.sdk.reactnative.model.DataSetType
import tools.amply.sdk.reactnative.model.DeepLinkPayload
import tools.amply.sdk.reactnative.model.EventEnvelope
import tools.amply.sdk.reactnative.model.toNativeDataSetType
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import java.lang.ref.WeakReference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import tools.amply.sdk.Amply
import tools.amply.sdk.actions.DeepLinkListener
import tools.amply.sdk.config.AmplyConfig
import tools.amply.sdk.config.amplyConfig
import tools.amply.sdk.core.AmplySDKInterface
import tools.amply.sdk.events.EventInterface
import tools.amply.sdk.events.SystemEventsListener

class DefaultAmplyClient(
  private val application: Application,
) : AmplyClient {

  private val mutex = Mutex()
  private var amplyInstance: Amply? = null
  private val deepLinkRegistered = AtomicBoolean(false)
  private val systemEventsRegistered = AtomicBoolean(false)
  private val deepLinkSequence = AtomicLong(0L)
  private val lastResumedActivity = AtomicReference<WeakReference<Activity>?>(null)
  private val sessionPrimed = AtomicBoolean(false)
  private val mainHandler = Handler(Looper.getMainLooper())

  private val _deepLinkEvents = MutableSharedFlow<DeepLinkPayload>(
    replay = 1,
    extraBufferCapacity = 16,
  )
  override val deepLinkEvents: SharedFlow<DeepLinkPayload> = _deepLinkEvents.asSharedFlow()
  private val _systemEvents = MutableSharedFlow<EventEnvelope>(
    replay = 32,
    extraBufferCapacity = 128,
  )
  override val systemEvents: SharedFlow<EventEnvelope> = _systemEvents.asSharedFlow()

  override suspend fun initialize(options: AmplyInitializationOptions) {
    var createdInstance = false
    mutex.withLock {
      if (amplyInstance == null) {
        val config = buildConfig(options)
        android.util.Log.i(
          "AmplyReactNative",
          "Initializing Amply with appId=${options.appId} apiKeyPublic=${options.apiKeyPublic.takeIf { it.isNotEmpty() } ?: "<empty>"}"
        )
        val instance = withContext(Dispatchers.Default) {
          Amply(config, application)
        }
        ensureSystemEventsListener(instance)
        amplyInstance = instance
        createdInstance = true
      }
    }
    if (createdInstance) {
      maybePrimeSessionTracker()
    }
  }

  override fun isInitialized(): Boolean = amplyInstance != null

  override suspend fun track(name: String, properties: Map<String, Any?>?) {
    val instance = requireInstance()
    withContext(Dispatchers.IO) {
      android.util.Log.i(
        "AmplyReactNative",
        "Tracking event '$name' with properties=${properties?.filterValues { it != null }}"
      )
      instance.track(name, properties?.toNonNullMap() ?: emptyMap())
    }
  }

  override suspend fun getRecentEvents(limit: Int): List<EventEnvelope> {
    val instance = requireInstance()
    return withContext(Dispatchers.IO) {
      val events = instance.getRecentEvents(limit)
      android.util.Log.i(
        "AmplyReactNative",
        "Fetched ${events.size} recent events (limit=$limit)"
      )
      events.map { it.toEventEnvelope() }
    }
  }

  override suspend fun getDataSetSnapshot(type: DataSetType): Map<String, Any?> {
    val instance = requireInstance()
    val nativeType = type.toNativeDataSetType()
    return withContext(Dispatchers.IO) {
      val snapshot = instance.getDataSetSnapshot(nativeType)
      android.util.Log.i(
        "AmplyReactNative",
        "DataSetSnapshot(${type.javaClass.simpleName}) keys=${snapshot.keys}"
      )
      snapshot.toNullableValues()
    }
  }

  override fun registerDeepLinkListener() {
    val instance = requireInstance()
    if (!deepLinkRegistered.compareAndSet(false, true)) {
      return
    }
    android.util.Log.i("AmplyReactNative", "Registering deep link listener")

    instance.registerDeepLinkListener(object : DeepLinkListener {
      override fun onDeepLink(url: String, info: Map<String, Any>): Boolean {
        android.util.Log.i(
          "AmplyReactNative",
          "Received deep link from Amply url=$url infoKeys=${info.keys}"
        )
        val payload = DeepLinkPayload(
          sequenceId = deepLinkSequence.incrementAndGet(),
          url = url,
          info = info.mapValues { it.value },
          consumed = false
        )
        if (!_deepLinkEvents.tryEmit(payload)) {
          android.util.Log.w(
            "AmplyReactNative",
            "Dropping deep link event due to backpressure sequenceId=${payload.sequenceId}"
          )
        }
        return false
      }
    })
  }

  override fun registerSystemEventListener() {
    val instance = requireInstance()
    android.util.Log.i(
      "AmplyReactNative",
      "registerSystemEventListener() called; alreadyRegistered=${systemEventsRegistered.get()}"
    )
    ensureSystemEventsListener(instance)
  }

  override fun onHostResume(activity: Activity?) {
    if (activity != null) {
      lastResumedActivity.set(WeakReference(activity))
    }
    maybePrimeSessionTracker()
  }

  override fun shutdown() {
    runBlocking {
      mutex.withLock {
        amplyInstance = null
      }
    }
    deepLinkRegistered.set(false)
    systemEventsRegistered.set(false)
    android.util.Log.i("AmplyReactNative", "Amply client shutdown; deep link listener cleared")
    deepLinkSequence.set(0L)
    sessionPrimed.set(false)
    lastResumedActivity.set(null)
    _deepLinkEvents.resetReplayCache()
    _systemEvents.resetReplayCache()
  }

  private fun requireInstance(): Amply {
    return amplyInstance ?: throw IllegalStateException("Amply has not been initialized yet")
  }

  private fun buildConfig(options: AmplyInitializationOptions): AmplyConfig {
    return amplyConfig {
      api {
        appId = options.appId
        apiKeyPublic = options.apiKeyPublic
        options.apiKeySecret?.let { apiKeySecret = it }
      }
      options.defaultConfig?.let { defaultConfig = it }
    }
  }

  private fun Map<String, Any?>.toNonNullMap(): Map<String, Any> =
    entries.mapNotNull { (key, value) -> value?.let { key to it } }.toMap()

  private fun Map<String, Any>.toNullableValues(): Map<String, Any?> =
    mapValues { it.value }

  private fun EventInterface.toEventEnvelope(): EventEnvelope =
    EventEnvelope(
      id = null,
      name = name,
      type = type.name.lowercase(),
      timestamp = timestamp,
      properties = properties.mapValues { it.value }
    )

  private fun ensureSystemEventsListener(instance: Amply) {
    if (!systemEventsRegistered.compareAndSet(false, true)) {
      android.util.Log.i(
        "AmplyReactNative",
        "System events listener already registered; skipping setSystemEventsListener"
      )
      return
    }
    instance.setSystemEventsListener(object : SystemEventsListener {
      override fun onEvent(event: EventInterface) {
        android.util.Log.i(
          "AmplyReactNative",
          "System event ${event.name} ts=${event.timestamp} props=${event.properties.keys}"
        )
        val envelope = event.toEventEnvelope()
        if (!_systemEvents.tryEmit(envelope)) {
          android.util.Log.w(
            "AmplyReactNative",
            "Dropping system event due to backpressure name=${event.name}"
          )
        }
      }
    })
  }

  private fun maybePrimeSessionTracker() {
    if (sessionPrimed.get()) {
      return
    }
    val instance = amplyInstance ?: return
    val activity = lastResumedActivity.get()?.get() ?: return
    if (Looper.myLooper() != Looper.getMainLooper()) {
      mainHandler.post { maybePrimeSessionTracker() }
      return
    }

    try {
      val coreField = Amply::class.java.getDeclaredField("amplyCore").apply {
        isAccessible = true
      }
      val core = coreField.get(instance) as? AmplySDKInterface ?: return
      val sessionManager = core.getSessionManager()
      val trackerField = sessionManager.javaClass.getDeclaredField("sessionTracker").apply {
        isAccessible = true
      }
      val sessionTracker = trackerField.get(sessionManager)
      if (sessionTracker is Application.ActivityLifecycleCallbacks) {
        sessionTracker.onActivityCreated(activity, null)
        sessionTracker.onActivityStarted(activity)
        sessionTracker.onActivityResumed(activity)
        sessionPrimed.set(true)
        android.util.Log.i(
          "AmplyReactNative",
          "Primed Amply session tracker with activity=${activity::class.java.simpleName}"
        )
      }
    } catch (error: Throwable) {
      android.util.Log.w(
        "AmplyReactNative",
        "Unable to prime Amply session tracker: ${error.message}"
      )
    }
  }
}
