# Development Guide

This guide is for SDK developers contributing to the Amply React Native SDK.

## Project Structure

```
src/                               # TypeScript source (JS side)
  ├── nativeSpecs/
  │   └── NativeAmplyModule.ts     # TurboModule spec (codegen source)
  ├── index.ts                      # Public API exports
  ├── nativeModule.ts               # Native module loader with fallbacks
  └── systemEvents.ts               # Event emitter helpers

android/                           # Android native code
  ├── src/main/
  │   ├── java/tools/amply/sdk/reactnative/
  │   │   ├── AmplyModule.kt        # TurboModule implementation
  │   │   ├── AmplyPackage.kt       # Package for React Native
  │   │   └── core/                 # Amply SDK wrapper
  │   └── jni/
  │       └── CMakeLists.txt        # C++ build config
  └── src/newarch/                  # Auto-generated codegen artifacts

ios/                               # iOS native code
  ├── AmplyReactNative.podspec      # CocoaPods spec
  └── Sources/AmplyReactNative/
      ├── AmplyModule.mm            # TurboModule implementation
      └── AmplyReactNative/         # Codegen artifacts (committed)
          ├── AmplyReactNative.h
          └── AmplyReactNative-generated.mm

example/bare/                      # Bare RN example app
example/expo/                      # Expo example app

plugin/                            # Expo config plugin source
  ├── src/
  │   ├── withAmply.ts              # Main plugin logic
  │   └── index.ts                  # Plugin export
  └── build/                        # Compiled plugin (generated)
```

## Build Commands

```bash
# Build TypeScript distribution
yarn build

# Build Expo config plugin
yarn build:plugin

# Run tests
yarn test

# Lint and type check
yarn lint && yarn typecheck
```

## Codegen

This SDK uses React Native TurboModules. When you modify the TypeScript spec (`src/nativeSpecs/NativeAmplyModule.ts`), the native codegen artifacts must be updated.

**Android:** Codegen runs automatically during Gradle build. No manual steps needed.

**iOS:** The committed codegen files must be manually updated:
- `ios/Sources/AmplyReactNative/AmplyReactNative/AmplyReactNative.h`
- `ios/Sources/AmplyReactNative/AmplyReactNative/AmplyReactNative-generated.mm`

When adding new methods or config fields to the spec:
1. Add the method/field declaration to the header struct
2. Add the inline implementation in the header
3. Add the host function and method mapping in the generated .mm file
4. Run `expo prebuild --clean` in example app to verify

## Sample Apps

The SDK includes two example apps for testing during development.

### Expo Sample (`example/expo`)

Recommended for fast iteration with hot reload.

```bash
cd example/expo
yarn install
expo prebuild --clean
expo start               # Terminal 1
expo run:android         # Terminal 2 (Android)
expo run:ios             # Terminal 2 (iOS)
```

### Bare React Native Sample (`example/bare`)

For production-like testing and intent filter validation.

```bash
cd example/bare
yarn install
yarn react-native run-android    # Android
yarn react-native run-ios        # iOS
```

### Local SDK Development

Sample apps use `link:` protocol for local SDK development:

```json
{
  "dependencies": {
    "@amplytools/react-native-amply-sdk": "link:../.."
  }
}
```

This allows immediate testing of SDK changes without npm reinstall.

> **Note:** Regular app developers should install from npm: `yarn add @amplytools/react-native-amply-sdk`

## Development Workflow

### 1. Setup workspace

```bash
yarn install
```

### 2. Make changes

```bash
# For TypeScript spec changes (new methods, config fields)
# 1. Edit the spec
nano src/nativeSpecs/NativeAmplyModule.ts
# 2. Update iOS codegen files manually (see Codegen section above)
# 3. Android codegen updates automatically during build

# For native implementation changes
nano android/src/main/java/tools/amply/sdk/reactnative/AmplyModule.kt
nano ios/Sources/AmplyReactNative/AmplyModule.mm

# For JS changes
nano src/index.ts
```

### 3. Test with sample apps

```bash
# Test with Expo (faster feedback)
cd example/expo
rm -rf android ios
expo prebuild --clean
expo start               # Terminal 1
expo run:android         # Terminal 2

# Validate with bare RN
cd ../bare
yarn react-native run-android
```

## Testing Deep Links

```bash
# iOS Simulator
xcrun simctl openurl booted "amply://campaign/promo/123"

# Android
adb shell am start -a android.intent.action.VIEW \
  -d "amply://campaign/promo/123" <package>
```

## PR Checklist

- [ ] Changes tested in both example apps
- [ ] `yarn lint && yarn typecheck && yarn test` passes
- [ ] iOS codegen files updated (if spec changed)
- [ ] Commit messages are clear
- [ ] No breaking changes (or documented)
- [ ] README updated if API changes
