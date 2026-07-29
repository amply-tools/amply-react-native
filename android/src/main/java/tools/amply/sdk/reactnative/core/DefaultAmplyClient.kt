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
import tools.amply.sdk.actions.AbortPolicy
import tools.amply.sdk.actions.CampaignPresenter
import tools.amply.sdk.actions.CampaignResolution
import tools.amply.sdk.actions.CampaignResult
import tools.amply.sdk.actions.DeepLinkListener
import tools.amply.sdk.core.GateDecision as KmpGateDecision
import tools.amply.sdk.core.ProceedReason as KmpProceedReason
import tools.amply.sdk.config.AmplyConfig
import tools.amply.sdk.config.amplyConfig
import tools.amply.sdk.core.AmplySDKInterface
import tools.amply.sdk.events.EventInterface
import tools.amply.sdk.events.SystemEventsListener
import tools.amply.sdk.core.ListenerToken
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
  private val gatePresenterRegistered = AtomicBoolean(false)
  private val deepLinkSequence = AtomicLong(0L)
  private val campaignPresentSequence = AtomicLong(0L)
  // Global routing table: mediationId -> the resolution token awaiting a JS reply. Shared
  // across every registered gate because resolveCampaign(mediationId) routes by exact id —
  // that lookup is correct regardless of which gate minted the id.
  private val pendingCompletions = ConcurrentHashMap<String, OwnedResolution>()
  private val lastResumedActivity = AtomicReference<WeakReference<Activity>?>(null)
  private val sessionPrimed = AtomicBoolean(false)
  private val mainHandler = Handler(Looper.getMainLooper())

  // The tokens the SDK hands back at registration. These are the ONLY things that can withdraw
  // each seam. shutdown() used to withdraw NOTHING at all: the log and system-event slots
  // happened to be overwritten by the next initialize(), but the deeplink list is append-only, so
  // it grew by one dead listener per reload for the life of the process and every deeplink was
  // fanned out to all of them. Gates had no withdrawal in the SDK to call.
  private val logListenerToken = AtomicReference<ListenerToken?>(null)
  private val systemEventsToken = AtomicReference<ListenerToken?>(null)
  private val deepLinkToken = AtomicReference<ListenerToken?>(null)
  private val gateTokens = java.util.concurrent.CopyOnWriteArrayList<ListenerToken>()

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

        // The LISTENER goes in before the LEVEL. Logger.setLevel emits a log entry
        // synchronously, so setting the level first hands that entry to whatever listener the
        // process had before — on a reload, the client of the host that is going away.
        val effectiveLogLevel = options.getEffectiveLogLevel()

        // Set up log listener to forward logs to JS
        logListenerToken.set(tools.amply.sdk.logging.Logger.setListener(object : LogListener {
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
        }))

        tools.amply.sdk.logging.Logger.setLevel(effectiveLogLevel.toString())
        android.util.Log.i("AmplyReactNative", "Pre-init log level set to: $effectiveLogLevel")

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

  override suspend fun trackGated(
    name: String,
    properties: Map<String, Any?>?,
  ): GateDecision {
    val instance = amplyInstance
    if (instance == null) {
      // Fail open: not initialized yet -> proceed immediately (mirrors KMP row 1).
      android.util.Log.w(
        "AmplyReactNative",
        "trackGated('$name') before init; failing open"
      )
      return GateDecision.FAIL_OPEN
    }
    android.util.Log.i(
      "AmplyReactNative",
      "trackGated('$name') with properties=${properties?.filterValues { it != null }}"
    )
    return try {
      // KMP: `suspend fun trackGated(event, props): GateDecision`. The bridge collapses
      // the raw decision into its own GateDecision; the CampaignResult never surfaces here.
      val decision = instance.trackGated(name, properties?.toNonNullMap() ?: emptyMap())
      decision.toBridgeDecision()
    } catch (cancellation: kotlinx.coroutines.CancellationException) {
      // Respect structured-concurrency cancellation, but the bridge contract is
      // "never throw" — a cancelled gate fails open.
      android.util.Log.w("AmplyReactNative", "trackGated('$name') cancelled; failing open")
      GateDecision.FAIL_OPEN
    } catch (throwable: Throwable) {
      android.util.Log.w("AmplyReactNative", "trackGated('$name') failed; failing open", throwable)
      GateDecision.FAIL_OPEN
    }
  }

  override fun registerGate(baseUrl: String, onAbort: String, timeoutMs: Long) {
    val instance = requireInstance()
    gatePresenterRegistered.set(true)
    val policy = when (onAbort) {
      "proceed" -> AbortPolicy.Proceed
      else -> AbortPolicy.Cancel
    }
    android.util.Log.i(
      "AmplyReactNative",
      "Registering gate baseUrl=$baseUrl onAbort=$onAbort timeoutMs=$timeoutMs"
    )
    // JS is the single capability registry and routes by baseUrl on its side; the
    // native gate carries the abort policy and timeout. Each registerGate registration
    // gets its OWN presenter instance owning its OWN "current presentation" slot, so a
    // dismiss() delivered to this gate's presenter can only abandon THIS gate's live
    // presentation — never one belonging to a different url-pattern's gate.
    gateTokens.add(
      instance.registerGate(
        baseUrl = baseUrl,
        presenter = GatePresenter(baseUrl),
        onAbort = policy,
        timeoutMs = if (timeoutMs > 0L) timeoutMs else DEFAULT_GATE_TIMEOUT_MS,
      )
    )
  }

  override fun resolveCampaign(mediationId: String, result: String) {
    val owner = pendingCompletions[mediationId]
    if (owner == null) {
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
    // settle() is at-most-once: a duplicate JS reply or a dismiss()/resolve() race is a no-op.
    owner.settle(mapped)
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

    deepLinkToken.set(instance.registerDeepLinkListener(object : DeepLinkListener {
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
    }))
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
    // Withdraw every seam FIRST, while the instance is still reachable.
    //
    // This used to withdraw nothing at all. The log and system-event slots happened to be
    // overwritten by the next initialize(), which hid the omission; the deeplink list is
    // append-only, so it grew by one dead listener per reload for the life of the process and
    // every deeplink was fanned out to all of them. Gates had no withdrawal in the SDK to call,
    // so a gate registered by a host that went away parked the next gated call on that URL for
    // the whole fail-open timeout.
    //
    // Ordered before `amplyInstance = null` because three of the four withdrawals go through it.
    val instance = amplyInstance
    logListenerToken.getAndSet(null)?.let { tools.amply.sdk.logging.Logger.clearListener(it) }
    if (instance != null) {
      systemEventsToken.getAndSet(null)?.let { instance.clearSystemEventsListener(it) }
      deepLinkToken.getAndSet(null)?.let { instance.removeDeepLinkListener(it) }
      gateTokens.forEach { instance.unregisterGate(it) }
    }
    gateTokens.clear()

    runBlocking {
      mutex.withLock {
        amplyInstance = null
      }
    }
    deepLinkRegistered.set(false)
    systemEventsRegistered.set(false)
    gatePresenterRegistered.set(false)
    android.util.Log.i("AmplyReactNative", "Amply client shutdown; deep link listener cleared")
    deepLinkSequence.set(0L)
    campaignPresentSequence.set(0L)
    sessionPrimed.set(false)
    lastResumedActivity.set(null)
    // Fail open any in-flight mediated actions so no continuation is left hanging. Each
    // OwnedResolution clears its owning presenter's current-id slot as it settles.
    val inFlight = pendingCompletions.values.toList()
    inFlight.forEach { owner ->
      try {
        owner.settle(CampaignResult.Unavailable)
      } catch (error: Throwable) {
        android.util.Log.w("AmplyReactNative", "Error settling gate presentation on shutdown: ${error.message}")
      }
    }
    _deepLinkEvents.resetReplayCache()
    _systemEvents.resetReplayCache()
  }

  private fun requireInstance(): Amply {
    return amplyInstance ?: throw IllegalStateException("Amply has not been initialized yet")
  }

  private fun buildConfig(options: AmplyInitializationOptions): AmplyConfig {
    val backend = options.effectiveBackendBaseUrl()
    return amplyConfig {
      api {
        appId = options.appId
        apiKeyPublic = options.apiKeyPublic
        options.apiKeySecret?.let { apiKeySecret = it }
      }
      // Applied rather than merely accepted. These were parsed out of the JS
      // config and then dropped on the floor, so an integrator who pointed the
      // app at a staging stack kept talking to production — no error, no log,
      // just their test traffic landing in real analytics.
      if (options.configBaseUrl != null || backend != null) {
        network {
          options.configBaseUrl?.let { configBaseUrl = it }
          backend?.let { backendBaseUrl = it }
        }
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

  // Collapses the KMP GateDecision into the bridge GateDecision. Verified against published
  // KMP 0.5.0-SNAPSHOT: `tools.amply.sdk.core.GateDecision = Proceed(reason: ProceedReason) |
  // Cancelled`, where `ProceedReason` is a TOP-LEVEL enum { Completed, FailOpen }.
  private fun KmpGateDecision.toBridgeDecision(): GateDecision =
    when (this) {
      is KmpGateDecision.Proceed ->
        when (reason) {
          KmpProceedReason.Completed -> GateDecision.COMPLETED
          KmpProceedReason.FailOpen -> GateDecision.FAIL_OPEN
        }
      is KmpGateDecision.Cancelled -> GateDecision.Cancelled
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
    systemEventsToken.set(instance.setSystemEventsListener(object : SystemEventsListener {
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
    }))
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

  /**
   * One KMP [CampaignPresenter] per [registerGate] registration (per url-pattern).
   *
   * Concurrency model: KMP presents at most one gate per url-pattern at a time (the gate is
   * modal — you cannot show two rewarded ads, or two presentations of the same pattern, at
   * once). KMP's [dismiss] is parameterless and is dispatched to the SPECIFIC presenter
   * instance registered for that pattern. So the "which presentation does my dismiss() target"
   * state must live PER-PRESENTER, here in [currentMediationId] — NOT in one global slot on the
   * client. With one global slot, an overlap of two different-pattern gates (A present, B
   * present, A dismiss) routes A's dismiss to B's token. Per-instance state makes A's dismiss
   * abandon only A's own live presentation.
   *
   * Concurrent presentations of the SAME url-pattern are not supported: a second present() on
   * this instance overwrites [currentMediationId], so a later dismiss() targets the latest. That
   * is acceptable and intended given the modal contract above. [pendingCompletions] stays global
   * (lookup by exact id is always correct), so a JS resolveCampaign for the overwritten id still
   * settles its own token directly.
   */
  private inner class GatePresenter(private val baseUrl: String) : CampaignPresenter {
    // The mediationId this presenter most recently present()ed and has not yet resolved/abandoned.
    // dismiss() targets exactly this id, so it can only ever release THIS gate's live presentation.
    private val currentMediationId = AtomicReference<String?>(null)

    override fun dismiss() {
      // The SDK calls dismiss() when this gate's caller coroutine is cancelled/times out and the
      // resolution token is abandoned. Presentation UI lives in JS (nothing native to tear down),
      // but the parked token MUST be released so pendingCompletions does not leak. Abandon exactly
      // THIS presenter's current presentation; the owner's at-most-once guard means a later JS
      // reply (resolveCampaign) becomes a harmless no-op.
      val id = currentMediationId.get()
      if (id == null) {
        android.util.Log.i("AmplyReactNative", "Gate[$baseUrl] dismiss() with no active presentation")
        return
      }
      val owner = pendingCompletions[id]
      android.util.Log.i("AmplyReactNative", "Gate[$baseUrl] dismiss() releasing mediationId=$id")
      owner?.abandon()
    }

    override fun present(
      params: Map<String, String>,
      info: Map<String, Any>,
      resolution: CampaignResolution,
    ) {
      val mediationId = UUID.randomUUID().toString()
      val owner = OwnedResolution(mediationId, resolution, this)
      pendingCompletions[mediationId] = owner
      currentMediationId.set(mediationId)
      val url = (info["url"] as? String).orEmpty()
      android.util.Log.i(
        "AmplyReactNative",
        "Gate[$baseUrl] dispatching present mediationId=$mediationId url=$url infoKeys=${info.keys}"
      )
      val payload = CampaignPresentPayload(
        sequenceId = campaignPresentSequence.incrementAndGet(),
        mediationId = mediationId,
        url = url,
        params = params.mapValues { it.value },
        info = info.mapValues { it.value },
      )
      if (!_campaignPresents.tryEmit(payload)) {
        // Backpressure / no collector: fail open by reporting Unavailable so the
        // gate still proceeds rather than hanging until timeout.
        android.util.Log.w(
          "AmplyReactNative",
          "Gate[$baseUrl] dropping present mediationId=$mediationId; reporting Unavailable (fail-open)"
        )
        owner.settle(CampaignResult.Unavailable)
      }
    }

    /** Clears the current-presentation slot iff it still points at [mediationId]. */
    fun clearIfCurrent(mediationId: String) {
      currentMediationId.compareAndSet(mediationId, null)
    }
  }

  /**
   * Owns one [CampaignResolution] token for the lifetime of a single gate presentation.
   *
   * Knows its own [mediationId] so it can remove itself from [pendingCompletions] no matter
   * which path settles it — a JS reply ([resolveCampaign]), the SDK abandoning the presentation
   * ([CampaignPresenter.dismiss]), a backpressure fail-open, or [shutdown]. The [done] guard makes
   * resolve and abandon mutually-exclusive and at-most-once: whichever fires first wins, the rest
   * are no-ops. This is what prevents the pending-resolution leak on timeout/cancel/dismiss.
   *
   * Holds a reference to its owning [GatePresenter] so settling also clears that presenter's
   * current-presentation slot (per-presenter, not global — see [GatePresenter]).
   */
  private inner class OwnedResolution(
    val mediationId: String,
    private val resolution: CampaignResolution,
    private val owner: GatePresenter,
  ) {
    private val done = AtomicBoolean(false)

    /** Resolve the underlying token exactly once and stop tracking this presentation. */
    fun settle(result: CampaignResult) {
      if (!done.compareAndSet(false, true)) return
      cleanup()
      resolution.resolve(result)
    }

    /**
     * The SDK abandoned the presentation (dismiss): drop the parked token without resolving.
     * The SDK's own timeout/cancel machinery owns the abort outcome here, so we must NOT also
     * resolve — we only release our reference so the map cannot leak.
     */
    fun abandon() {
      if (!done.compareAndSet(false, true)) return
      cleanup()
    }

    private fun cleanup() {
      pendingCompletions.remove(mediationId, this)
      owner.clearIfCurrent(mediationId)
    }
  }

  private companion object {
    // Fallback when JS passes timeoutMs = 0 (i.e. "use a sensible default").
    const val DEFAULT_GATE_TIMEOUT_MS = 30_000L
  }
}
