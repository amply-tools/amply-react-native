import getNativeModule from './nativeModule';
import {addSystemEventListenerRaw, addSystemEventListener as addSystemEventListenerInternal} from './systemEvents';
export {useAmplySystemEvents} from './hooks/useAmplySystemEvents';
export {formatSystemEventLabel} from './systemEventUtils';
export type {FormatOptions} from './systemEventUtils';
import type {
  CampaignResult,
  GateDecision,
  AmplyInitializationConfig,
  DataSetSnapshot,
  DataSetType,
  DeepLinkEvent,
  EventRecord,
  LogLevel,
  CampaignPresentEvent,
  TrackEventPayload,
} from './nativeSpecs/NativeAmplyModule';

let deepLinkRegistered = false;
let debugLogListenerRegistered = false;
const deepLinkSubscriptions = new Set<() => void>();
const campaignPresenterSubscriptions = new Set<() => void>();

/**
 * What is registered NATIVELY, keyed by gate baseUrl — at most one entry per URL, because a
 * second `registerGate` on the same URL evicts the first rather than stacking on top of it.
 *
 * This used to be a `Set<string>` written the moment a native call was made, whether or not
 * that call did anything. Three defects came out of that one optimistic write: two presenters
 * both showing a single presentation, a withdrawal that left the native gate live, and a
 * registration made before `initialize` being lost for the lifetime of the process.
 */
const gateRegistrations = new Map<string, {id: number; removeSubscription: () => void}>();

/**
 * Identity for a gate registration. Withdrawal cannot be keyed by URL alone: an unsubscribe
 * handed out for a registration that has since been evicted would otherwise withdraw whatever
 * holds that URL now, killing its replacement. A stale handle must be inert.
 */
let nextGateRegistrationId = 1;

/**
 * Registrations made before the SDK was up. The native side refuses those with a log line and
 * no return value, so JS cannot tell refusal from success — it asks `isInitialized()` first and
 * parks the work here instead, to be replayed by [initialize].
 */
type PendingRegistration = {cancelled: boolean; apply: () => void};
const pendingRegistrations: PendingRegistration[] = [];

/** True when the native module exists AND the SDK behind it has been initialised. */
function isSdkUp(): boolean {
  try {
    return getNativeModule().isInitialized();
  } catch {
    return false;
  }
}

/**
 * Runs [apply] now if the SDK is up, otherwise parks it until [initialize] completes.
 * Returns a canceller so a caller that withdraws before initialisation is never replayed.
 */
function applyWhenSdkIsUp(apply: () => void): () => void {
  if (isSdkUp()) {
    apply();
    return () => {};
  }
  const pending: PendingRegistration = {
    cancelled: false,
    apply: () => {
      if (!pending.cancelled) {
        apply();
      }
    },
  };
  pendingRegistrations.push(pending);
  return () => {
    pending.cancelled = true;
  };
}

function replayPendingRegistrations(): void {
  const queued = pendingRegistrations.splice(0, pendingRegistrations.length);
  queued.forEach(pending => {
    try {
      pending.apply();
    } catch (error) {
      console.warn('[Amply] Failed to apply a registration deferred until initialize', error);
    }
  });
}

/**
 * Withdraws the gate registered for [baseUrl], on both sides. A no-op when nothing is
 * registered, so callers do not need to check first.
 */
function withdrawGate(baseUrl: string, onlyIfId?: number): void {
  const registration = gateRegistrations.get(baseUrl);
  if (!registration) {
    return;
  }
  // Compare before clearing, the same rule the SDK's own listener seams follow: a caller
  // holding a stale handle must not withdraw the registration that replaced it.
  if (onlyIfId !== undefined && registration.id !== onlyIfId) {
    return;
  }
  gateRegistrations.delete(baseUrl);
  registration.removeSubscription();
  try {
    getNativeModule().unregisterGate(baseUrl);
  } catch (error) {
    console.warn('[Amply] Failed to unregister gate', baseUrl, error);
  }
}

/**
 * Format a debug log entry for console output using new format.
 */
function formatDebugLog(event: EventRecord): string {
  const props = event.properties as {
    level?: string;
    category?: string;
    message?: string;
  };
  const level = props.level?.toUpperCase() || 'DEBUG';
  const category = props.category
    ? props.category.charAt(0).toUpperCase() + props.category.slice(1)
    : 'Sdk';
  const timestamp = new Date(event.timestamp).toISOString();
  return `[${timestamp}][Amply.${category}][${level}] ${props.message || ''}`;
}

/**
 * Set up debug log listener that outputs to console.
 */
function ensureDebugLogListener(): void {
  if (debugLogListenerRegistered) {
    return;
  }
  debugLogListenerRegistered = true;

  addSystemEventListenerRaw((event: EventRecord) => {
    if (event.name === 'DebugLog') {
      const formattedLog = formatDebugLog(event);
      const props = event.properties as {level?: string};
      const level = props.level?.toLowerCase();

      switch (level) {
        case 'error':
          console.error(formattedLog);
          break;
        case 'warn':
          console.warn(formattedLog);
          break;
        case 'debug':
          console.debug(formattedLog);
          break;
        default:
          console.log(formattedLog);
      }
    }
  });
}

async function ensureDeepLinkRegistration(): Promise<void> {
  if (deepLinkRegistered) {
    return;
  }
  // The flag is set inside apply(), not here: native refuses while the SDK is down, and
  // recording that refusal as success is what stranded the listener for the whole process.
  applyWhenSdkIsUp(() => {
    getNativeModule().registerDeepLinkListener();
    deepLinkRegistered = true;
  });
}

function trackDeepLinkSubscription(subscription?: {remove?: () => void}): () => void {
  let removed = false;
  const unsubscribe = () => {
    if (removed) {
      return;
    }
    removed = true;
    subscription?.remove?.();
    deepLinkSubscriptions.delete(unsubscribe);
  };
  deepLinkSubscriptions.add(unsubscribe);
  return unsubscribe;
}

export async function initialize(config: AmplyInitializationConfig): Promise<void> {
  // Set up debug log listener if debug mode is enabled
  if (config.debug || config.logLevel) {
    ensureDebugLogListener();
  }
  await getNativeModule().initialize(config);
  // Anything the host registered before this point was parked rather than lost.
  replayPendingRegistrations();
}

/**
 * Set the user ID for analytics. Pass null to clear.
 * @param userId The user ID to set, or null to clear
 */
export function setUserId(userId: string | null): void {
  getNativeModule().setUserId(userId);
}

/**
 * Set the log level at runtime.
 * @param level The log level: 'none' | 'error' | 'warn' | 'info' | 'debug'
 */
export function setLogLevel(level: LogLevel): void {
  if (level !== 'none') {
    ensureDebugLogListener();
  }
  getNativeModule().setLogLevel(level);
}

/**
 * Get the current log level.
 * @returns The current log level
 */
export function getLogLevel(): LogLevel {
  return getNativeModule().getLogLevel() as LogLevel;
}

export function isInitialized(): boolean {
  return getNativeModule().isInitialized();
}

/**
 * Records an event. Fire-and-forget: the promise resolves once the event has been handed
 * to the native SDK, not when a campaign finishes. A campaign matched by this event runs
 * on its own and never blocks the caller — use {@link trackGated} at a call site that has
 * to wait for a campaign's outcome before continuing.
 *
 * {@link trackEvent} is the same call with positional arguments.
 */
export async function track(payload: TrackEventPayload): Promise<void> {
  await getNativeModule().track(payload);
}

/**
 * Possible results a gate presenter can report. Re-exported from the
 * native spec for app presenters.
 */
export type {CampaignResult, GateDecision};

/**
 * Outcome of a gate presenter's presentation, reported back via {@link GateResolution}.
 */
export type GatePresenterResult = CampaignResult;

/**
 * Resolution token handed to a {@link GatePresenter}. The presenter MUST report
 * exactly one terminal result. Convenience helpers map to the underlying
 * {@link CampaignResult}.
 */
export type GateResolution = {
  /** The gate condition was satisfied (e.g. rewarded ad watched to completion). */
  completed: () => void;
  /** The user deliberately dismissed without satisfying the condition. */
  dismissed: () => void;
  /** Any non-user failure (no-fill, not-ready, failed-to-show). Fails open. */
  unavailable: () => void;
};

/**
 * A capability presenter for a gate (blocking) action, registered via
 * {@link registerGate} and keyed by the gate's `baseUrl`. Receives the parsed query
 * `params`, the enriched `info`, and a {@link GateResolution} token it must resolve
 * exactly once. Throwing synchronously is treated as `unavailable` (fail-open).
 */
export type GatePresenter = (
  params: Record<string, unknown>,
  info: Record<string, unknown>,
  resolution: GateResolution,
) => void;

/**
 * Options for {@link registerGate}.
 */
export type RegisterGateOptions = {
  /**
   * Abort policy when the user dismisses the gate without satisfying it.
   * - `'cancel'` → {@link trackGated} resolves `{ outcome: 'cancelled' }`.
   * - `'proceed'` → {@link trackGated} resolves `{ outcome: 'proceed', reason: 'failOpen' }`.
   * Defaults to `'cancel'`.
   */
  onAbort?: 'cancel' | 'proceed';
  /**
   * Max time (ms) the gate waits for a presenter result before failing open.
   * Defaults to the SDK's gate default.
   */
  timeoutMs?: number;
};

/**
 * Records an event — the positional-argument form of {@link track}, shaped like
 * {@link trackGated} so gated and non-gated call sites read the same. Behaviour is
 * identical to {@link track}: fire-and-forget, never blocks on a campaign.
 *
 * Both forms are supported; pick one and stay consistent within a codebase.
 */
export async function trackEvent(
  event: string,
  properties?: Record<string, unknown> | null,
): Promise<void> {
  await getNativeModule().track({name: event, properties: properties ?? {}});
}

/**
 * Gated track. Records the event; if a gate action matches AND a presenter is
 * registered for its `baseUrl`, the SDK dispatches the presentation and awaits its
 * outcome before resolving:
 * - `{ outcome: 'proceed', reason: 'completed' }` — the presenter satisfied the gate.
 * - `{ outcome: 'proceed', reason: 'failOpen' }` — no gate matched, not initialized,
 *   timeout, unavailable, infra failure, or dismiss under `onAbort=proceed`.
 * - `{ outcome: 'cancelled' }` — user dismiss under an `onAbort=cancel` gate.
 *
 * This NEVER rejects: any infra failure resolves to `{ outcome: 'proceed', reason:
 * 'failOpen' }` so the caller is never stranded.
 */
export async function trackGated(
  event: string,
  properties?: Record<string, unknown> | null,
): Promise<GateDecision> {
  const props = properties ?? {};
  try {
    const decision = (await getNativeModule().trackGated(event, props)) as Partial<GateDecision>;
    if (decision && decision.outcome === 'cancelled') {
      return {outcome: 'cancelled'};
    }
    if (decision && decision.outcome === 'proceed') {
      const reason = decision.reason === 'completed' ? 'completed' : 'failOpen';
      return {outcome: 'proceed', reason};
    }
    // Unexpected/malformed payload: fail open.
    console.warn('[Amply] trackGated returned an unexpected decision; failing open', decision);
    return {outcome: 'proceed', reason: 'failOpen'};
  } catch (error) {
    // Fail open: any bridge/SDK failure must proceed, never strand the caller.
    console.warn('[Amply] trackGated failed; proceeding (fail-open)', error);
    return {outcome: 'proceed', reason: 'failOpen'};
  }
}

function trackCampaignPresenterSubscription(subscription?: {remove?: () => void}): () => void {
  let removed = false;
  const unsubscribe = () => {
    if (removed) {
      return;
    }
    removed = true;
    subscription?.remove?.();
    campaignPresenterSubscriptions.delete(unsubscribe);
  };
  campaignPresenterSubscriptions.add(unsubscribe);
  return unsubscribe;
}

/**
 * Register a gate presenter for a gate (blocking) action, keyed by its `baseUrl`.
 * The presenter is invoked when a matching gate is dispatched; it receives the parsed
 * query `params`, the enriched `info`, and a {@link GateResolution} it must resolve
 * exactly once (`completed`/`dismissed`/`unavailable`). The SDK collapses multi-step
 * ad lifecycles into the single result you report. A synchronous throw → `unavailable`
 * (fail-open).
 *
 * One presenter per `baseUrl`: registering the same URL again REPLACES the previous
 * presenter and re-applies the options, rather than adding a second one. Two presenters on
 * one URL would both be handed the same presentation, so both would show UI and the outcome
 * would be decided by whichever reported first.
 *
 * Safe to call before {@link initialize} — the registration is held and applied once the SDK
 * is up. Withdrawing before then cancels it instead.
 *
 * @returns an unsubscribe function. It withdraws the NATIVE gate as well as this
 * subscription; a gate left registered behind a departed presenter parks the next gated call
 * on that URL for its whole fail-open timeout, silently.
 */
export async function registerGate(
  baseUrl: string,
  presenter: GatePresenter,
  opts?: RegisterGateOptions,
): Promise<() => void> {
  const onAbort = opts?.onAbort ?? 'cancel';
  const timeoutMs = opts?.timeoutMs ?? 0;

  const registrationId = nextGateRegistrationId++;

  const attach = () => {
    // Evict at APPLY time, not at call time. Two registrations made before `initialize` are
    // both only queued, so a call-time eviction would find nothing in the registry to evict —
    // and both would then attach at replay, the second overwriting the map entry while the
    // first subscription stayed live. That is the duplicate-presenter defect on another path.
    withdrawGate(baseUrl);

    const nativeModule = getNativeModule();
    nativeModule.registerGate(baseUrl, onAbort, timeoutMs);

    let subscription: {remove?: () => void} | undefined;
    try {
      subscription = nativeModule.onCampaignPresent((event: CampaignPresentEvent) => {
      const {url, params, info, mediationId} = event;
      // The native side routes by baseUrl, but guard here too because every gate shares the
      // single onCampaignPresent channel.
      if (baseUrl && url && !url.startsWith(baseUrl)) {
        return;
      }

      let settled = false;
      const report = (result: CampaignResult) => {
        if (settled) {
          return;
        }
        settled = true;
        nativeModule.resolveCampaign(mediationId, result);
      };
      const resolution: GateResolution = {
        completed: () => report('Completed'),
        dismissed: () => report('Dismissed'),
        unavailable: () => report('Unavailable'),
      };

        try {
          presenter(
            (params ?? {}) as Record<string, unknown>,
            info as Record<string, unknown>,
            resolution,
          );
        } catch (error) {
          // Presenter failure is an infra failure, never a user dismiss → Unavailable.
          console.warn('[Amply] gate presenter threw; reporting Unavailable (fail-open)', error);
          report('Unavailable');
        }
      });
    } catch (error) {
      // The native gate is already registered at this point. Leaving it would be the exact
      // defect this whole change exists to remove — a gate with no presenter behind it — and
      // nothing would be tracked to withdraw it later, so withdraw it here.
      console.warn('[Amply] Failed to subscribe a gate presenter; withdrawing the gate', error);
      try {
        nativeModule.unregisterGate(baseUrl);
      } catch (withdrawError) {
        console.warn('[Amply] Failed to withdraw the gate after a failed subscribe', withdrawError);
      }
      throw error;
    }

    gateRegistrations.set(baseUrl, {
      id: registrationId,
      removeSubscription: () => subscription?.remove?.(),
    });
  };

  const cancelPending = applyWhenSdkIsUp(attach);

  let withdrawn = false;
  const unsubscribe = () => {
    if (withdrawn) {
      return;
    }
    withdrawn = true;
    cancelPending();
    // Only if THIS registration still holds the URL — see withdrawGate.
    withdrawGate(baseUrl, registrationId);
    campaignPresenterSubscriptions.delete(unsubscribe);
  };
  campaignPresenterSubscriptions.add(unsubscribe);
  return unsubscribe;
}

export async function getRecentEvents(limit: number): Promise<EventRecord[]> {
  return getNativeModule().getRecentEvents(limit);
}

export async function getDataSetSnapshot(type: DataSetType): Promise<DataSetSnapshot> {
  return getNativeModule().getDataSetSnapshot(type);
}

export async function addDeepLinkListener(
  listener: (event: DeepLinkEvent) => void
): Promise<() => void> {
  await ensureDeepLinkRegistration();
  const subscription = getNativeModule().onDeepLink(listener);
  return trackDeepLinkSubscription(subscription);
}

export async function addSystemEventListener(
  listener: (event: EventRecord) => void
): Promise<() => void> {
  return addSystemEventListenerInternal(listener);
}

/**
 * Custom property value type. Supports string, number, and boolean values.
 */
export type CustomPropertyValue = string | number | boolean;

/**
 * Set a single custom property.
 * @param key The property key (max 32 characters)
 * @param value The property value (string max 255 characters)
 */
export function setCustomProperty(key: string, value: CustomPropertyValue): void {
  getNativeModule().setCustomProperties({[key]: value});
}

/**
 * Set multiple custom properties at once.
 * @param properties Key-value map of properties to set
 */
export function setCustomProperties(properties: Record<string, CustomPropertyValue>): void {
  getNativeModule().setCustomProperties(properties);
}

/**
 * Get a custom property value by key.
 * @param key The property key
 * @returns The property value, or null if not found
 */
export async function getCustomProperty(key: string): Promise<CustomPropertyValue | null> {
  const result = await getNativeModule().getCustomProperty(key);
  const map = result as {value?: unknown};
  return (map.value as CustomPropertyValue) ?? null;
}

/**
 * Remove a custom property by key.
 * @param key The property key to remove
 */
export function removeCustomProperty(key: string): void {
  getNativeModule().removeCustomProperty(key);
}

/**
 * Remove all custom properties.
 */
export function clearCustomProperties(): void {
  getNativeModule().clearCustomProperties();
}

export function removeAllListeners(): void {
  deepLinkSubscriptions.forEach(unsubscribe => {
    try {
      unsubscribe();
    } catch (error) {
      console.warn('[Amply] Failed to remove deep link listener', error);
    }
  });
  deepLinkSubscriptions.clear();

  campaignPresenterSubscriptions.forEach(unsubscribe => {
    try {
      unsubscribe();
    } catch (error) {
      console.warn('[Amply] Failed to remove gate presenter', error);
    }
  });
  campaignPresenterSubscriptions.clear();

  // Each unsubscribe above withdraws its own gate. Anything still here was registered by a
  // path that did not go through registerGate's tracker; withdraw it too rather than just
  // forgetting it, which is what the old `registeredGates.clear()` did — leaving JS believing
  // nothing was registered while the gates were still live natively.
  Array.from(gateRegistrations.keys()).forEach(withdrawGate);
  pendingRegistrations.length = 0;
}

export type {
  AmplyInitializationConfig,
  DataSetSnapshot,
  DataSetType,
  DeepLinkEvent,
  EventRecord,
  LogLevel,
  CampaignPresentEvent,
  TrackEventPayload,
};

export function addSystemEventsListener(
  listener: (event: EventRecord) => void,
): Promise<() => void> {
  return addSystemEventListener(listener);
}

export const systemEvents = {
  addListener: addSystemEventsListener,
};

export default {
  initialize,
  isInitialized,
  track,
  trackEvent,
  trackGated,
  registerGate,
  getRecentEvents,
  getDataSetSnapshot,
  addDeepLinkListener,
  addSystemEventListener,
  addSystemEventsListener,
  removeAllListeners,
  setUserId,
  setLogLevel,
  getLogLevel,
  setCustomProperty,
  setCustomProperties,
  getCustomProperty,
  removeCustomProperty,
  clearCustomProperties,
  systemEvents,
};
