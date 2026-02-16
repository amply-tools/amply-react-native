import getNativeModule from './nativeModule';
import type {SystemEventPayload} from './nativeSpecs/NativeAmplyModule';

/** Raw listener – receives ALL events including DebugLog. Internal use only. */
export async function addSystemEventListenerRaw(
  listener: (event: SystemEventPayload) => void,
): Promise<() => void> {
  const subscription = getNativeModule().onSystemEvent(listener);
  return () => subscription?.remove?.();
}

/** Public listener – filters out DebugLog events (handled by console output). */
export async function addSystemEventListener(
  listener: (event: SystemEventPayload) => void,
): Promise<() => void> {
  return addSystemEventListenerRaw(event => {
    if (event.name === 'DebugLog') {
      return;
    }
    listener(event);
  });
}

export const systemEvents = {
  addListener: addSystemEventListener,
};
