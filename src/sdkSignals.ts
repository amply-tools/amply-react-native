/**
 * What the core SDK tells an integration without importing it: an integration lives behind its own
 * entry point, so the apps that do not use it never load its code.
 */
export type SdkSignal = 'initialized' | 'user-id-set';

type Listener = (signal: SdkSignal) => void;

let listeners: readonly Listener[] = [];

export function onSdkSignal(listener: Listener): void {
  listeners = [...listeners, listener];
}

export function emitSdkSignal(signal: SdkSignal): void {
  listeners.forEach((listener) => listener(signal));
}
