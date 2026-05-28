import getNativeModule from './nativeModule';
import {addSystemEventListenerRaw, addSystemEventListener as addSystemEventListenerInternal} from './systemEvents';
export {useAmplySystemEvents} from './hooks/useAmplySystemEvents';
export {formatSystemEventLabel} from './systemEventUtils';
export type {FormatOptions} from './systemEventUtils';
import type {
  CampaignResult,
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
let campaignPresenterRegistered = false;
const deepLinkSubscriptions = new Set<() => void>();
const campaignPresenterSubscriptions = new Set<() => void>();

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
  if (!deepLinkRegistered) {
    console.log('[Amply] Calling registerDeepLinkListener on native module');
    getNativeModule().registerDeepLinkListener();
    deepLinkRegistered = true;
    console.log('[Amply] registerDeepLinkListener completed');
  }
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

export async function track(payload: TrackEventPayload): Promise<void> {
  await getNativeModule().track(payload);
}

/**
 * Continuation hooks for the gating form of {@link trackEvent}.
 *
 * `onProceed` is "what to do next" (run exactly once when the gate resolves in
 * favor of proceeding). `onCancel` is an OPTIONAL local-UI cleanup hook, invoked
 * only when a campaign's blocking action is user-dismissed under an `onAbort=cancel`
 * policy. Never put business logic in `onCancel`.
 *
 * The raw campaign result is deliberately not exposed — app code must never branch
 * on which action ran or how it resolved.
 */
export type TrackEventContinuation = {
  onProceed: () => void;
  onCancel?: () => void;
};

/**
 * Possible results a campaign presenter can report. Re-exported from the
 * native spec for app presenters.
 */
export type {CampaignResult};

/**
 * A capability presenter for a campaign present (blocking) action. Keyed by deeplink
 * URL semantics, NOT by event — the app is a registry of capabilities. Returns (or
 * resolves) the terminal {@link CampaignResult}. Throwing / rejecting is treated as
 * `'Unavailable'` (fail-open).
 */
export type CampaignPresenter = (
  url: string,
  info: Record<string, unknown>,
) => CampaignResult | Promise<CampaignResult>;

/**
 * Fire-and-forget analytics track. Records the event and lets any matching NORMAL
 * campaign action dispatch as usual. A blocking action matched here will NOT fire —
 * there is no continuation to gate.
 */
export function trackEvent(event: string, properties?: Record<string, unknown> | null): Promise<void>;
/**
 * Continuation (gating) form. Records the event; if a blocking campaign action
 * matches AND a presenter is registered, the SDK dispatches it and awaits its result
 * before resolving the continuation:
 * - proceed (completed / unavailable / timeout / dismissed+proceed) → `onProceed`
 * - user dismiss against an `onAbort=cancel` action → `onCancel`
 *
 * Fails open: any error path runs `onProceed`. Passing a continuation is the gating
 * switch — the same event tracked elsewhere without one is a valid, non-gating call.
 */
export function trackEvent(
  event: string,
  properties: Record<string, unknown> | null | undefined,
  continuation: TrackEventContinuation,
): Promise<void>;
export async function trackEvent(
  event: string,
  properties?: Record<string, unknown> | null,
  continuation?: TrackEventContinuation,
): Promise<void> {
  const props = properties ?? {};

  if (!continuation) {
    await getNativeModule().track({name: event, properties: props});
    return;
  }

  let decision: string;
  try {
    decision = await getNativeModule().trackEventGated(event, props);
  } catch (error) {
    // Fail open: any bridge/SDK failure must proceed, never strand the app.
    console.warn('[Amply] trackEvent continuation failed; proceeding (fail-open)', error);
    continuation.onProceed();
    return;
  }

  if (decision === 'cancel') {
    // A deliberate user-dismiss under an onAbort=cancel action. Only the local-UI
    // cleanup hook runs; the continuation is suppressed.
    continuation.onCancel?.();
    return;
  }

  // 'complete' and any unexpected value fail open to onProceed.
  continuation.onProceed();
}

async function ensureCampaignPresenterRegistration(): Promise<void> {
  if (!campaignPresenterRegistered) {
    getNativeModule().registerCampaignPresenter();
    campaignPresenterRegistered = true;
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
 * Register a capability presenter for campaign present (blocking) actions. The presenter
 * is invoked when a blocking action is dispatched; it must report a terminal
 * {@link CampaignResult} (returned or resolved). The SDK collapses multi-step ad
 * lifecycles into the single result you report. Throwing/rejecting → `'Unavailable'`.
 *
 * @returns an unsubscribe function.
 */
export async function registerCampaignPresenter(
  presenter: CampaignPresenter,
): Promise<() => void> {
  await ensureCampaignPresenterRegistration();

  const nativeModule = getNativeModule();
  const subscription = nativeModule.onCampaignPresent((event: CampaignPresentEvent) => {
    const {url, info, mediationId} = event;
    void Promise.resolve()
      .then(() => presenter(url, info as Record<string, unknown>))
      .then(
        result => {
          nativeModule.resolveCampaign(mediationId, result);
        },
        error => {
          // Presenter failure is an infra failure, never a user dismiss → Unavailable.
          console.warn('[Amply] campaign presenter failed; reporting Unavailable', error);
          nativeModule.resolveCampaign(mediationId, 'Unavailable');
        },
      );
  });

  return trackCampaignPresenterSubscription(subscription);
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
      console.warn('[Amply] Failed to remove campaign presenter', error);
    }
  });
  campaignPresenterSubscriptions.clear();
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
  registerCampaignPresenter,
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
