import getNativeModule from './nativeModule';
import type {SystemEventPayload} from './nativeSpecs/NativeAmplyModule';

export async function addSystemEventListener(
  listener: (event: SystemEventPayload) => void,
): Promise<() => void> {
  const subscription = getNativeModule().onSystemEvent(listener);
  return () => subscription?.remove?.();
}

export const systemEvents = {
  addListener: addSystemEventListener,
};
