import getNativeModule from './nativeModule';
import {addSystemEventListenerRaw, addSystemEventListener as addSystemEventListenerInternal} from './systemEvents';
export {useAmplySystemEvents} from './hooks/useAmplySystemEvents';
export {formatSystemEventLabel} from './systemEventUtils';
export type {FormatOptions} from './systemEventUtils';
import type {
  AmplyInitializationConfig,
  DataSetSnapshot,
  DataSetType,
  DeepLinkEvent,
  EventRecord,
  LogLevel,
  TrackEventPayload,
} from './nativeSpecs/NativeAmplyModule';

let deepLinkRegistered = false;
let debugLogListenerRegistered = false;
const deepLinkSubscriptions = new Set<() => void>();

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

export function removeAllListeners(): void {
  deepLinkSubscriptions.forEach(unsubscribe => {
    try {
      unsubscribe();
    } catch (error) {
      console.warn('[Amply] Failed to remove deep link listener', error);
    }
  });
  deepLinkSubscriptions.clear();
}

export type {
  AmplyInitializationConfig,
  DataSetSnapshot,
  DataSetType,
  DeepLinkEvent,
  EventRecord,
  LogLevel,
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
  getRecentEvents,
  getDataSetSnapshot,
  addDeepLinkListener,
  addSystemEventListener,
  addSystemEventsListener,
  removeAllListeners,
  setUserId,
  setLogLevel,
  getLogLevel,
  systemEvents,
};
