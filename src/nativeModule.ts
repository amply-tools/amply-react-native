import {NativeModules, TurboModuleRegistry} from 'react-native';
import type {Spec} from './nativeSpecs/NativeAmplyModule';

const MODULE_NAME = 'Amply';

let cachedModule: Spec | null = null;
let attemptedTurboLookup = false;
let resolvedTurboModule: Spec | null = null;

function loadModule(): Spec | null {
  const globalWithTurbo = globalThis as typeof globalThis & {
    __turboModuleProxy?: unknown;
  };

  if (globalWithTurbo.__turboModuleProxy != null) {
    if (!attemptedTurboLookup) {
      attemptedTurboLookup = true;
      try {
        resolvedTurboModule = TurboModuleRegistry.getEnforcing<Spec>(MODULE_NAME);
      } catch (error) {
        resolvedTurboModule = null;
        if (__DEV__) {
          console.warn(
            "[Amply] TurboModule lookup failed; falling back to legacy NativeModules. " +
              (error instanceof Error ? error.message : String(error))
          );
        }
      }
    }
    if (resolvedTurboModule) {
      return resolvedTurboModule;
    }
  }

  const legacyModule = NativeModules[MODULE_NAME] as Spec | undefined;
  if (legacyModule) {
    return legacyModule;
  }

  return null;
}

export function getNativeModule(): Spec {
  if (cachedModule) {
    return cachedModule;
  }

  const module = loadModule();
  if (!module) {
    throw new Error(
      `Amply native module '${MODULE_NAME}' not found. ` +
        'Ensure @amplytools/react-native-amply-sdk is installed, native dependencies are rebuilt, ' +
        'and the package is registered by React Native autolinking ' +
        '(Android: present in generated PackageList.java; iOS: pod installed and Pods rebuilt).'
    );
  }

  cachedModule = module;
  return cachedModule;
}

// Testing hook to override the resolved native module.
export function __setNativeModule(mock: Spec | null): void {
  cachedModule = mock;
}

export default getNativeModule;
