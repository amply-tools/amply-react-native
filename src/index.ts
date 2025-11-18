import getNativeModule from './nativeModule';
import {addSystemEventListener as addSystemEventListenerInternal} from './systemEvents';
export {useAmplySystemEvents} from './hooks/useAmplySystemEvents';
export {formatSystemEventLabel} from './systemEventUtils';
import type {
  AmplyInitializationConfig,
  DataSetSnapshot,
  DataSetType,
  DeepLinkEvent,
  EventRecord,
  TrackEventPayload,
} from './nativeSpecs/NativeAmplyModule';

let deepLinkRegistered = false;
const deepLinkSubscriptions = new Set<() => void>();

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
  await getNativeModule().initialize(config);
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
  systemEvents,
};
