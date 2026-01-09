# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

React Native TurboModule bridge for Amply Kotlin Multiplatform (KMP) SDK. Enables event tracking, deeplink campaigns, and data collection in React Native apps.

**Platform Status:**
- Android: Fully functional (TurboModule wraps KMP SDK)
- iOS: Implementation complete, awaiting XCFramework distribution

**Requirements:** React Native 0.79+, Expo SDK 53+, Android API 24+, New Architecture enabled

## Build Commands

```bash
# Root SDK commands
yarn build              # Build TypeScript distribution (tsup)
yarn build:plugin       # Build Expo config plugin only
yarn test               # Run Jest tests
yarn codegen            # Generate native bindings from TurboModule spec

# Example apps
cd example/expo
yarn prebuild           # Generate native code + run config plugin
yarn ios                # Build and run on iOS simulator
yarn android            # Build and run on Android

cd example/bare
yarn react-native run-android
yarn react-native run-ios
```

## Architecture

### TurboModule Bridge Pattern

```
JavaScript (src/)
    └── NativeAmplyModule.ts (TurboModule spec - codegen source)
            ↓ codegen
Native Android (android/src/main/java/tools/amply/sdk/reactnative/)
    ├── AmplyModule.kt (TurboModule implementation)
    ├── AmplyPackage.kt (React Native package registration)
    └── core/DefaultAmplyClient.kt (KMP SDK wrapper)

Native iOS (ios/Sources/AmplyReactNative/)
    └── AmplyModule.mm (Objective-C++ TurboModule)
```

### Key Integration Mechanisms

**Autolinking:** `react-native.config.js` enables automatic native module discovery for both Bare RN and Expo

**Expo Config Plugin:** `plugin/src/withAmply.ts` registers `AmplyPackage` in `MainApplication.kt` during `expo prebuild`

**Local Development:** Example apps use `"link:../../"` dependency for rapid SDK iteration without npm reinstall

### Codegen Flow

When `src/nativeSpecs/NativeAmplyModule.ts` changes:
1. Run `yarn codegen`
2. Generates `android/src/newarch/` (Java spec + JNI bindings)
3. Generates `ios/Sources/AmplyReactNative/` (Objective-C++ spec)

## Key Files

| File | Purpose |
|------|---------|
| `src/nativeSpecs/NativeAmplyModule.ts` | TurboModule interface definition (source of truth) |
| `src/index.ts` | Public API exports |
| `android/.../AmplyModule.kt` | Android TurboModule implementation |
| `android/.../DefaultAmplyClient.kt` | KMP SDK wrapper |
| `ios/.../AmplyModule.mm` | iOS TurboModule implementation |
| `plugin/src/withAmply.ts` | Expo config plugin |
| `react-native.config.js` | Autolinking configuration |
| `example/expo/scripts/register-amply-package.js` | Post-prebuild script for workspace dependencies |

## Development Workflow

1. Edit SDK source (`src/`, `android/`, `ios/`)
2. If TurboModule spec changed: `yarn codegen`
3. Test with Expo example (faster iteration):
   ```bash
   cd example/expo
   yarn prebuild --clean
   yarn ios  # or yarn android
   ```
4. Validate with Bare RN example for production scenarios

## Native SDK Integration

**Android:** KMP SDK imported as Gradle dependency (`tools.amply:sdk-android:0.1.7`)

**iOS:** KMP SDK via XCFramework in `ios/Frameworks/` (vendored), linked via podspec

## Testing Deep Links

```bash
# iOS Simulator
xcrun simctl openurl booted "amply://campaign/promo/123"

# Android
adb shell am start -a android.intent.action.VIEW -d "amply://campaign/promo/123" <package>
```

## Event Emitter Pattern

Native modules emit events to JS via TurboModule EventEmitter:
- `onDeepLink` - Campaign deep links from SDK
- `onSystemEvent` - SDK lifecycle events (session start/end, config fetch)

JS listeners registered via `Amply.addDeepLinkListener()` and `systemEvents.addListener()`
