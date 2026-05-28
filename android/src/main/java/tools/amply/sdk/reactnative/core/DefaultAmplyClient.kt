package tools.amply.sdk.reactnative.core

import android.app.Activity
import android.app.Application
import android.os.Handler
import android.os.Looper
import tools.amply.sdk.reactnative.model.AmplyInitializationOptions
import tools.amply.sdk.reactnative.model.DataSetType
import tools.amply.sdk.reactnative.model.DeepLinkPayload
import tools.amply.sdk.reactnative.model.EventEnvelope
import tools.amply.sdk.reactnative.model.CampaignPresentPayload
import tools.amply.sdk.reactnative.model.toNativeDataSetType
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import java.util.UUID
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
import tools.amply.sdk.actions.CampaignResolution
import tools.amply.sdk.actions.CampaignResult
import tools.amply.sdk.actions.DeepLinkListener
import tools.amply.sdk.actions.CampaignPresenter
import tools.amply.sdk.config.AmplyConfig
import tools.amply.sdk.config.amplyConfig
import tools.amply.sdk.core.AmplySDKInterface
import tools.amply.sdk.events.EventInterface
import tools.amply.sdk.events.SystemEventsListener
import tools.amply.sdk.logging.LogEntry
import tools.amply.sdk.logging.LogListener

class DefaultAmplyClient(
  private val application: Application,
) : AmplyClient {

  private val mutex = Mutex()
  @Volatile private var amplyInstance: Amply? = null
  private val propertyLock = Any()
  private val pendingPropertyOps = mutableListOf<(Amply) -> Unit>()
  private val deepLinkRegistered = AtomicBoolean(false)
  private val systemEventsRegistered = AtomicBoolean(false)
  private val campaignPresenterRegistered = AtomicBoolean(false)
  private val deepLinkSequence = AtomicLong(0L)
  private val campaignPresentSequence = AtomicLong(0L)
  private val pendingCompletions = ConcurrentHashMap<String, CampaignResolution>()
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

  private val _logEvents = MutableSharedFlow<EventEnvelope>(
    replay = 64,
    extraBufferCapacity = 64,
  )
  override val logEvents: SharedFlow<EventEnvelope> = _logEvents.asSharedFlow()

  private val _campaignPresents = MutableSharedFlow<CampaignPresentPayload>(
    replay = 0,
    extraBufferCapacity = 16,
  )
  override val campaignPresents: SharedFlow<CampaignPresentPayload> = _campaignPresents.asSharedFlow()

  override suspend fun initialize(options: AmplyInitializationOptions) {
    var createdInstance = false
    mutex.withLock {
      if (amplyInstance == null) {
        val config = buildConfig(options)
        android.util.Log.i(
          "AmplyReactNative",
          "Initializing Amply with appId=${options.appId} apiKeyPublic=${options.apiKeyPublic.takeIf { it.isNotEmpty() } ?: "<empty>"}"
        )

        // Set log level and listener BEFORE creating instance so initialization logs are captured
        val effectiveLogLevel = options.getEffectiveLogLevel()
        tools.amply.sdk.logging.Logger.setLevel(effectiveLogLevel.toString())
        android.util.Log.i("AmplyReactNative", "Pre-init log level set to: $effectiveLogLevel")

        // Set up log listener to forward logs to JS
        tools.amply.sdk.logging.Logger.setListener(object : LogListener {
          override fun onLog(entry: LogEntry) {
            val envelope = EventEnvelope(
              id = null,
              name = "DebugLog",
              type = "log",
              timestamp = entry.timestamp,
              properties = buildMap {
                put("level", entry.level.toString().lowercase())
                put("category", entry.category)
                put("message", entry.message)
                entry.details?.let { put("details", it) }
              }
            )
            _logEvents.tryEmit(envelope)
          }
        })

        val instance = withContext(Dispatchers.Default) {
          Amply(config, application)
        }

        ensureSystemEventsListener(instance)

        // Drain buffered property operations under propertyLock
        synchronized(propertyLock) {
          amplyInstance = instance
          if (pendingPropertyOps.isNotEmpty()) {
            android.util.Log.i("AmplyReactNative", "Draining ${pendingPropertyOps.size} buffered property operations")
            pendingPropertyOps.forEach { op -> op(instance) }
            pendingPropertyOps.clear()
          }
        }

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

  override fun trackEventGated(
    name: String,
    properties: Map<String, Any?>?,
    onProceed: () -> Unit,
    onCancel: () -> Unit,
  ) {
    val instance = amplyInstance
    if (instance == null) {
      // Fail open: not initialized yet -> proceed immediately (mirrors KMP row 1).
      android.util.Log.w(
        "AmplyReactNative",
        "trackEventGated('$name') before init; proceeding (fail-open)"
      )
      onProceed()
      return
    }
    android.util.Log.i(
      "AmplyReactNative",
      "trackEventGated('$name') with properties=${properties?.filterValues { it != null }}"
    )
    // KMP continuation overload guarantees exactly-once, main-thread delivery of the
    // callbacks. The bridge simply forwards them; the raw result never surfaces here.
    instance.trackEvent(
      name,
      properties?.toNonNullMap() ?: emptyMap(),
      onProceed,
      onCancel,
    )
  }

  override fun registerCampaignPresenter() {
    val instance = requireInstance()
    if (!campaignPresenterRegistered.compareAndSet(false, true)) {
      return
    }
    android.util.Log.i("AmplyReactNative", "Registering campaign presenter")
    // Catch-all registration: the JS layer is the single capability registry and
    // routes by URL on its side. Per-URL-pattern KMP registration is reserved for
    // native integrators.
    instance.registerCampaignPresenter(object : CampaignPresenter {
      override fun present(
        url: String,
        info: Map<String, Any>,
        completion: CampaignResolution,
      ) {
        val mediationId = UUID.randomUUID().toString()
        pendingCompletions[mediationId] = completion
        android.util.Log.i(
          "AmplyReactNative",
          "Dispatching campaign present mediationId=$mediationId url=$url infoKeys=${info.keys}"
        )
        val payload = CampaignPresentPayload(
          sequenceId = campaignPresentSequence.incrementAndGet(),
          mediationId = mediationId,
          url = url,
          info = info.mapValues { it.value },
        )
        if (!_campaignPresents.tryEmit(payload)) {
          // Backpressure / no collector: fail open by reporting Unavailable so the
          // SDK's continuation still proceeds rather than hanging until timeout.
          android.util.Log.w(
            "AmplyReactNative",
            "Dropping campaign present mediationId=$mediationId; reporting Unavailable (fail-open)"
          )
          pendingCompletions.remove(mediationId)
          completion.resolve(CampaignResult.Unavailable)
        }
      }
    })
  }

  override fun resolveCampaign(mediationId: String, result: String) {
    val completion = pendingCompletions.remove(mediationId)
    if (completion == null) {
      // Late/duplicate/unknown reply — the SDK token is the source of truth and is
      // already settled (or never existed). Ignore.
      android.util.Log.i(
        "AmplyReactNative",
        "resolveCampaign for unknown/settled mediationId=$mediationId result=$result; ignored"
      )
      return
    }
    val mapped = result.toCampaignResult()
    android.util.Log.i(
      "AmplyReactNative",
      "resolveCampaign mediationId=$mediationId result=$result -> $mapped"
    )
    completion.resolve(mapped)
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

  /**
   * Registers a listener for deep links triggered by Amply SDK campaigns.
   *
   * This listener allows app developers to:
   * 1. Know that a deep link originated from Amply SDK (vs. external sources like
   *    push notifications, browser links, or other SDKs)
   * 2. Access campaign metadata via the `info` map (campaign ID, variant, etc.)
   *    that is not available in the URL itself
   * 3. Track/log Amply-specific deep link events for analytics
   *
   * Example use case:
   *   // In JS:
   *   Amply.addDeepLinkListener(event => {
   *     // We know this deep link came from an Amply campaign, not from elsewhere
   *     analytics.track('Amply campaign triggered', { url: event.url, info: event.info });
   *   });
   *
   * The deep link flow:
   *   Campaign triggers → KMP SDK → onDeepLink callback → JS event emitted
   *                                      ↓ (then)
   *                              startActivity(Intent.ACTION_VIEW) → Linking API
   *
   * Note: The listener is an observer, not a controller. The SDK will still open
   * the URL via system after emitting the event.
   */
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

  override fun setUserId(userId: String?) {
    val instance = requireInstance()
    instance.setUserId(userId)
    android.util.Log.i("AmplyReactNative", "User ID set to: ${userId ?: "<null>"}")
  }

  override fun setCustomProperty(key: String, value: Any) {
    synchronized(propertyLock) {
      val instance = amplyInstance
      if (instance != null) {
        instance.setCustomProperty(key, value)
        android.util.Log.i("AmplyReactNative", "Custom property set: $key")
      } else {
        android.util.Log.i("AmplyReactNative", "Buffering setCustomProperty until init: $key")
        pendingPropertyOps.add { it.setCustomProperty(key, value) }
      }
    }
  }

  override fun setCustomProperties(properties: Map<String, Any?>) {
    synchronized(propertyLock) {
      val instance = amplyInstance
      if (instance != null) {
        instance.setCustomProperties(properties.toNonNullMap())
        android.util.Log.i("AmplyReactNative", "Custom properties set: ${properties.keys}")
      } else {
        android.util.Log.i("AmplyReactNative", "Buffering setCustomProperties until init: ${properties.keys}")
        val snapshot = properties.toNonNullMap()
        pendingPropertyOps.add { it.setCustomProperties(snapshot) }
      }
    }
  }

  override fun removeCustomProperty(key: String) {
    synchronized(propertyLock) {
      val instance = amplyInstance
      if (instance != null) {
        instance.removeCustomProperty(key)
        android.util.Log.i("AmplyReactNative", "Custom property removed: $key")
      } else {
        android.util.Log.i("AmplyReactNative", "Buffering removeCustomProperty until init: $key")
        pendingPropertyOps.add { it.removeCustomProperty(key) }
      }
    }
  }

  override fun clearCustomProperties() {
    synchronized(propertyLock) {
      val instance = amplyInstance
      if (instance != null) {
        instance.clearCustomProperties()
        android.util.Log.i("AmplyReactNative", "All custom properties cleared")
      } else {
        android.util.Log.i("AmplyReactNative", "Buffering clearCustomProperties until init")
        pendingPropertyOps.add { it.clearCustomProperties() }
      }
    }
  }

  override suspend fun getCustomProperty(key: String): Any? {
    val instance = requireInstance()
    return withContext(Dispatchers.IO) {
      instance.getCustomProperty(key)
    }
  }

  override fun setLogLevel(level: tools.amply.sdk.reactnative.model.LogLevel) {
    val instance = amplyInstance ?: return
    instance.setLogLevel(level.toString())
    android.util.Log.i("AmplyReactNative", "Log level set to: $level")
  }

  override fun getLogLevel(): tools.amply.sdk.reactnative.model.LogLevel {
    val instance = amplyInstance ?: return tools.amply.sdk.reactnative.model.LogLevel.NONE
    val kmpLevel = instance.getLogLevel()
    return tools.amply.sdk.reactnative.model.LogLevel.fromString(kmpLevel.toString())
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
    campaignPresenterRegistered.set(false)
    android.util.Log.i("AmplyReactNative", "Amply client shutdown; deep link listener cleared")
    deepLinkSequence.set(0L)
    campaignPresentSequence.set(0L)
    sessionPrimed.set(false)
    lastResumedActivity.set(null)
    // Fail open any in-flight mediated actions so no continuation is left hanging.
    val inFlight = pendingCompletions.values.toList()
    pendingCompletions.clear()
    inFlight.forEach { completion ->
      try {
        completion.resolve(CampaignResult.Unavailable)
      } catch (error: Throwable) {
        android.util.Log.w("AmplyReactNative", "Error settling mediated action on shutdown: ${error.message}")
      }
    }
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

  // Maps the JS-reported result string to the KMP enum. Strict semantics: anything
  // that isn't a deliberate user 'Dismissed' or an explicit 'Completed' fails open to
  // Unavailable (proceed) — never strand the continuation on a malformed value.
  private fun String.toCampaignResult(): CampaignResult =
    when (this) {
      "Completed" -> CampaignResult.Completed
      "Dismissed" -> CampaignResult.Dismissed
      "Unavailable" -> CampaignResult.Unavailable
      else -> {
        android.util.Log.w(
          "AmplyReactNative",
          "Unknown campaign result '$this'; treating as Unavailable (fail-open)"
        )
        CampaignResult.Unavailable
      }
    }

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
