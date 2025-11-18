# Amply React Native SDK – Architecture Guide

This document provides a comprehensive overview of the Amply React Native SDK's architectural design, implementation approaches, integration patterns, system event lifecycle, and development workflow. It consolidates technical decisions and serves as the single source of truth for how the SDK is built and maintained.

---

## Table of Contents

1. [Overview](#overview)
2. [Architectural Pattern](#architectural-pattern)
3. [Bare React Native vs Expo Implementation](#bare-react-native-vs-expo-implementation)
4. [System Events Lifecycle](#system-events-lifecycle)
5. [Module Loading Strategy](#module-loading-strategy)
6. [Build & Development Workflow](#build--development-workflow)
7. [Script Commands Reference](#script-commands-reference)
8. [Future Roadmap](#future-roadmap)

---

## Overview

### What is the Amply React Native SDK?

The Amply React Native SDK is a **TurboModule bridge** that connects React Native applications to the **Amply Kotlin Multiplatform (KMP) SDK**. It enables:

- **Event tracking** – Custom and system event collection
- **Deeplink campaign handling** – Parse and respond to deep link campaigns
- **Real-time data access** – Query device, user, and session datasets
- **Event inspection** – Retrieve recent tracked events for debugging

### Architecture in One Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  React Native Application (JS/TypeScript)                   │
│  - import { initialize, track, addSystemEventsListener }   │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────────┐
        │  TurboModule Bridge             │
        │  (New Architecture Only)        │
        │  - Codegen-generated spec      │
        │  - EventEmitter channels       │
        └──────────────┬──────────────────┘
                       │
        ┌──────────────┴──────────────────┐
        │  Android Native (Kotlin)        │
        │  - AmplyModule (TurboModule)   │
        │  - DefaultAmplyClient wrapper  │
        │  - Lifecycle management        │
        └──────────────┬──────────────────┘
                       │
        ┌──────────────┴──────────────────┐
        │  Amply KMP SDK                  │
        │  (tools.amply.sdk.Amply)       │
        │  - Event tracking              │
        │  - Dataset management          │
        │  - Deeplink routing            │
        └─────────────────────────────────┘
```

---

## Architectural Pattern

### 1. **Layered Architecture**

The SDK follows a clean, maintainable layered design:

| Layer | Location | Responsibility |
|-------|----------|---|
| **TypeScript API** | `src/` | Public API, type exports, event emitter helpers, React hooks |
| **TurboModule Spec** | `src/nativeSpecs/` | Authoritative contract for codegen (generates C++/Java/ObjC bindings) |
| **Android Native** | `android/src/main/` | Kotlin wrapper managing lifecycle and bridging to KMP SDK |
| **Expo Plugin** | `plugin/src/` | Configuration plugin for managed workflow (registers packages automatically) |

### 2. **TurboModule Pattern (New Architecture Only)**

React Native's **New Architecture** is the only supported integration path. This simplifies maintenance and unlocks JSI-backed performance.

**Why New Architecture only?**
- Eliminates double maintenance burden of legacy bridge + New Architecture
- Enables type-safe, codegen-driven API contract
- Leverages `EventEmitter` for reliable event delivery
- Supports iOS when the Amply iOS SDK ships

**How it works:**

```
1. Developer writes TypeScript spec (NativeAmplyModule.ts)
                    ↓
2. React Native Codegen reads spec → generates language bindings
   - Java stubs (Android)
   - C++ glue code (both platforms)
   - ObjC++ headers (iOS)
                    ↓
3. Native code extends generated stubs
   - Implements actual functionality
   - Calls parent `emit*()` methods to send events to JS
                    ↓
4. JS calls NativeAmply methods via TurboModule registry
```

### 3. **Event Streaming Pattern**

Events flow through **TurboModule EventEmitters**, NOT DeviceEventEmitter:

```
Amply KMP SDK
  ├─ SharedFlow<SystemEvent> collector started in AmplyModule
  ├─ Each event → AmplyModule.emitOnSystemEvent(payload)
  └─ JS: NativeAmply.onSystemEvent(listener) receives updates

Amply KMP SDK
  ├─ DeepLink listeners registered in DefaultAmplyClient
  ├─ Each deeplink → AmplyModule.emitOnDeepLink(payload)
  └─ JS: NativeAmply.onDeepLink(listener) receives updates
```

**Why TurboModule EventEmitters?**
- Works identically in Legacy Bridge and New Architecture
- Type-safe – payloads defined in spec
- Single integration point – no DeviceEventEmitter fallback needed
- Events propagate deterministically

### 4. **Client Wrapper Pattern**

The `DefaultAmplyClient` (Kotlin) isolates the KMP SDK and manages:
- Lifecycle (initialization, shutdown)
- Coroutine scopes
- `SharedFlow` for event streaming
- Activity lifecycle priming
- Thread safety

**Why wrap the KMP SDK?**
- Decouples the React Native layer from KMP implementation details
- Allows async-to-promise bridging
- Manages native resources cleanly
- Makes testing easier (mock `AmplyClient` interface)

### 5. **Spec-Driven Codegen**

The **NativeAmplyModule.ts** file is the authoritative contract:

```typescript
export interface Spec extends TurboModule {
  initialize(config: AmplyInitializationConfig): Promise<void>;
  isInitialized(): boolean;
  track(payload: TrackEventPayload): Promise<void>;
  getRecentEvents(limit: number): Promise<EventRecord[]>;
  getDataSetSnapshot(type: DataSetType): Promise<DataSetSnapshot>;
  readonly onSystemEvent: EventEmitter<SystemEventPayload>;
  readonly onDeepLink: EventEmitter<DeepLinkEvent>;
}
```

This spec:
- Defines every method, parameter, and return type
- Maps to Java, C++, and ObjC++ via codegen
- Serves as the foundation for future Contract Fabric automation (sync with KMP SDK schema)
- Is version-controlled so changes are visible in git history

---

## Bare React Native vs Expo Implementation

Both integration paths use the **same SDK code** but differ in **discovery and package registration**.

### Bare React Native Integration

**How it works:**

1. **Autolinking via `react-native.config.js`**

   React Native's autolinking system discovers native modules automatically:

   ```javascript
   // react-native.config.js
   module.exports = {
     dependency: {
       platforms: {
         android: {
           sourceDir: androidProjectDir,
           packageImportPath: 'import com.amply.reactnative.AmplyPackage;',
           packageInstance: 'new AmplyPackage()',
           cmakeListsPath: path.join(androidJniDir, 'CMakeLists.txt'),
         },
       },
     },
     codegenConfig: {
       name: 'AmplyReactNative',
       type: 'modules',
       jsSrcsDir: path.join(__dirname, 'src'),
       android: { sourceDir: codegenSourceDirAndroid, packageName: 'com.amply.reactnative' },
     },
   };
   ```

2. **React Native applies the config**
   - Reads `react-native.config.js` from `@amply/amply-react-native` package
   - Auto-imports `AmplyPackage` in `MainApplication.java`
   - Auto-registers it: `new AmplyPackage()` in the packages list
   - Runs codegen to generate TurboModule bindings

3. **Codegen generates native stubs**
   - Java spec base class in `android/src/newarch/java/`
   - C++ glue code in `android/src/newarch/jni/`
   - Helper methods: `emitOnSystemEvent()`, `emitOnDeepLink()`

4. **Developer rebuilds**
   ```bash
   yarn react-native run-android
   ```
   - Gradle compiles generated + hand-written Kotlin code
   - React Native bundle includes JS layer
   - Module is immediately available

**Advantages:**
- Zero manual configuration
- Fully automatic package discovery
- Works with standard React Native tooling
- Explicit in git (easy to audit changes)

**Limitations:**
- Requires React Native >= 0.79
- Requires New Architecture enabled in `gradle.properties`
- No CLI setup needed, but build setup must be done upfront

### Expo Integration

**How it works:**

1. **User adds plugin to `app.json`**

   ```json
   {
     "expo": {
       "plugins": ["@amply/amply-react-native"]
     }
   }
   ```

2. **Expo Config Plugin runs during `expo prebuild`**

   The `withAmply.ts` plugin:
   - Reads the generated `MainApplication.kt`
   - Adds import: `import com.amply.reactnative.AmplyPackage`
   - Adds registration: `add(AmplyPackage())` in the packages block
   - Ensures idempotency (doesn't duplicate imports)

3. **Expo prebuild completes**
   - Merges autolinking config from `react-native.config.js`
   - Merges plugin config from `withAmply`
   - Generates native code in `android/app/src/main/`
   - Runs codegen
   - Prepares Gradle for compilation

4. **Developer runs the app**
   ```bash
   expo prebuild --clean  # Generate native code
   expo run:android       # Compile and deploy
   ```

**Why both paths are needed:**

| Scenario | Path |
|----------|------|
| Custom Gradle/Kotlin build | Bare RN (react-native.config.js only) |
| Managed development (Expo CLI) | Expo (config plugin + react-native.config.js) |
| No native code edits planned | Expo (faster iteration) |
| Custom native modules needed | Bare RN (full control) |

**Integration schematic:**

```
┌─────────────────────────────────────────┐
│  Developer Code & Config                │
│  - package.json (dependencies)          │
│  - app.json (plugins) [Expo only]       │
└────────┬────────────────────────────────┘
         │
         ├─→ [Bare RN Path]
         │   react-native run-android
         │     ↓
         │   React Native CLI reads react-native.config.js
         │     ↓
         │   Autolinking injects AmplyPackage
         │     ↓
         │   Gradle compiles
         │
         └─→ [Expo Path]
             expo prebuild --clean
               ↓
             Expo reads app.json plugins
               ↓
             withAmply plugin modifies MainApplication
               ↓
             Autolinking also applies (react-native.config.js)
               ↓
             Gradle compiles
```

---

## System Events Lifecycle

### Event Flow End-to-End

System events travel from the KMP SDK → Kotlin wrapper → React Native → JS application in these steps:

#### **Step 1: KMP SDK Emits Event**

The Amply Kotlin Multiplatform SDK internally tracks system events (e.g., session start, app open, deeplink received). When an event occurs:

```kotlin
// Inside Amply KMP SDK (tools.amply.sdk.Amply)
internal val systemEvents = MutableSharedFlow<SystemEvent>()

fun trackSystemEvent(event: SystemEvent) {
    viewModelScope.launch {
        systemEvents.emit(event)  // ← Events flow here
    }
}
```

#### **Step 2: Kotlin Wrapper Collects Events**

The `DefaultAmplyClient` subscribes to the KMP's event stream:

```kotlin
// android/src/main/java/com/amply/reactnative/core/DefaultAmplyClient.kt
private val amplyClient = Amply.getInstance()

init {
    scope.launch {
        amplyClient.systemEvents.collect { event ->
            // Event received, forward to AmplyModule
            onSystemEvent?.invoke(event)
        }
    }
}
```

#### **Step 3: TurboModule Receives and Emits**

The `AmplyModule` receives the event from `DefaultAmplyClient` and pushes it through the TurboModule EventEmitter:

```kotlin
// android/src/main/java/com/amply/reactnative/AmplyModule.kt
class AmplyModule(reactContext: ReactApplicationContext) : NativeAmplyModuleSpec(reactContext) {

    private val client = DefaultAmplyClient(...)

    init {
        // Register callback from client
        client.onSystemEvent = { event ->
            // Convert Kotlin object to WritableMap
            val payload = event.toWritableMap()
            // Emit to JS via codegen-generated method
            emitOnSystemEvent(payload)
        }
    }
}
```

The `emitOnSystemEvent(payload)` method is **generated by React Native Codegen**:

```java
// Generated by codegen (android/src/newarch/java/com/.../NativeAmplyModuleSpec.java)
protected void emitOnSystemEvent(WritableMap payload) {
    // Internal RN plumbing routes this to all registered listeners
}
```

#### **Step 4: Event Arrives in JS**

The event propagates through the TurboModule EventEmitter to all registered JS listeners:

```javascript
// src/systemEvents.ts
import NativeAmply from './nativeModule';

export function addSystemEventsListener(listener) {
  const subscription = NativeAmply.onSystemEvent((payload) => {
    listener(payload);  // ← JS application receives event
  });
  return () => subscription?.remove?.();
}
```

#### **Step 5: Application Consumes Event**

A React component can listen using the JavaScript API:

```typescript
// Consumer code
import { addSystemEventsListener } from '@amply/amply-react-native';

addSystemEventsListener((event) => {
  console.log('System event:', event);
  // Update UI, trigger analytics, etc.
});
```

Or using the React hook:

```typescript
import { useAmplySystemEvents } from '@amply/amply-react-native';

function MyComponent() {
  const events = useAmplySystemEvents();
  // events is a live array of recent system events
  return <EventLog events={events} />;
}
```

### Event Stream Architecture Details

**Why SharedFlow?**

The `SharedFlow` in Kotlin is a **hot stream**:
- Events are emitted whether or not collectors are listening
- Perfect for system-level events (don't want to miss app-open because listener wasn't registered yet)
- Supports multiple collectors simultaneously

**Timing guarantees:**

```
Event emitted from KMP SDK
    ↓ (immediate, on KMP dispatcher thread)
Kotlin collector receives it
    ↓ (coroutine context switch if needed)
emitOnSystemEvent() called from TurboModule
    ↓ (queued in RN event loop)
JS listener callback fired
    ↓ (may be batched with other JS events)
Application receives event
```

Latency is typically < 50ms for simple events, but is subject to:
- Thread dispatcher availability
- React Native event loop congestion
- JS execution time

**Listener Lifecycle:**

```javascript
// Listener added
const unsubscribe = addSystemEventsListener((event) => {
  console.log(event);
});

// After this point, all emitted events reach the listener
// ...

// Listener removed
unsubscribe();

// After this point, emitted events do NOT reach this listener
// (but other listeners still receive them)
```

### Event Types

**System Events** are emitted by the Amply KMP SDK for:
- **Session lifecycle** – User opens app, closes app, session expires
- **User identification** – User logs in, logs out
- **App lifecycle** – App enters foreground, enters background
- **Location events** – If location tracking is enabled
- **Custom tracked events** – If the app calls `track()`

Each event carries:
```typescript
type SystemEventPayload = {
  id?: string;              // Unique event ID
  name: string;             // Event name: "session_start", "app_open", etc.
  type: 'custom' | 'system'; // Always 'system' for these
  timestamp: number;        // Unix timestamp (ms)
  properties: JsonMap;      // Event metadata
};
```

---

## Module Loading Strategy

### Why Dynamic Loading?

The SDK doesn't hardcode `require('NativeModules').Amply` because:
1. Module may not be available (development, wrong RN version)
2. Want to support both New Architecture (TurboModule) and legacy bridge (future)
3. Need clear error messages if module is missing

### Loading Process

**Step 1: Attempt TurboModule Registry**

```typescript
// src/nativeModule.ts
import { TurboModuleRegistry } from 'react-native';

let cachedModule: any = null;

try {
  cachedModule = TurboModuleRegistry.getEnforcing<Spec>('Amply');
} catch (error) {
  // TurboModule not found or not properly linked
}
```

`getEnforcing()` means:
- Fail fast if module is registered but broken
- Don't silently fall back to legacy bridge (we don't want that)

**Step 2: Fallback to Legacy Bridge (if enabled)**

```typescript
if (!cachedModule) {
  try {
    cachedModule = NativeModules.Amply;
  } catch (error) {
    throw new Error('Amply native module not found...');
  }
}
```

Currently, this fallback is **not recommended** but is prepared for future compatibility.

**Step 3: Cache and Return**

```typescript
export function getNativeModule(): Spec {
  if (!cachedModule) {
    throw new Error('Amply module not initialized');
  }
  return cachedModule;
}
```

### When Module Loading Fails

**If `TurboModuleRegistry.getEnforcing()` throws:**
- Module is **registered** but **broken** (native code crash, type mismatch)
- Error message is specific → helps debugging
- App initialization will fail

**Common causes:**
- `react-native.config.js` not applied (didn't rebuild)
- Codegen stubs missing (didn't run codegen)
- Kotlin code has syntax error (didn't compile)
- AmplyPackage not registered in MainApplication

---

## Build & Development Workflow

### Why Multiple Build Commands?

The SDK has three distinct build steps:

#### **1. Codegen**

```bash
yarn codegen
```

**What it does:**
- Reads `codegen.config.json` to find the TypeScript spec
- Finds `src/nativeSpecs/NativeAmplyModule.ts`
- Generates language-specific bindings

**Outputs:**
- `android/src/newarch/java/com/amply/reactnative/**` – Java spec base + helper methods
- `android/src/newarch/jni/**` – C++ glue code
- `ios/Sources/AmplyReactNative/**` – ObjC++ (placeholder until iOS SDK ships)

**When to run:**
- After changing the `Spec` interface
- After changing type definitions in `NativeAmplyModule.ts`
- Before committing spec changes (artifacts must be in sync)

**Why it's separate:**
- Codegen takes several seconds (compiles and runs Gradle tasks)
- Only needed when the contract changes
- Not needed for implementation changes (Kotlin code edits, JS logic, etc.)

#### **2. JavaScript Bundling (TypeScript → JS)**

```bash
yarn build
# Internally runs: expo-module build (which uses tsup)
```

**What it does:**
- Compiles TypeScript to JavaScript using `tsup`
- Generates ES Modules (`.mjs`) and CommonJS (`.js`)
- Type checks via `tsc` → generates `.d.ts` files
- Outputs to `dist/` directory

**Outputs:**
- `dist/index.js` – CommonJS entry point (consumers importing from Node)
- `dist/index.mjs` – ES Module entry point (bundlers like Metro)
- `dist/src/**/*.d.ts` – TypeScript declarations

**When to run:**
- After changing any TypeScript/JavaScript code
- Before running example apps locally (they import from dist/)
- Before publishing to npm
- When you need to link locally and test changes

**Why the rebuild matters:**
- React Native Metro bundler requires compiled output
- When using `yarn link` or `file:../` paths, Metro resolves the `main` field in package.json
- package.json points to `dist/index.js`, so it must be built

#### **3. Plugin Build**

```bash
yarn build:plugin
```

**What it does:**
- Compiles the Expo config plugin TypeScript code
- Outputs to `plugin/build/index.js`
- Makes it executable by Expo CLI during `expo prebuild`

**When to run:**
- After changing `plugin/src/withAmply.ts`
- Before testing with Expo apps
- Before publishing

### Complete Build Sequence

When publishing or setting up for local testing:

```bash
# 1. Check spec hasn't changed (if it has, run codegen)
# yarn codegen  # Only if you edited NativeAmplyModule.ts

# 2. Build JavaScript and types
yarn build

# 3. Build plugin (Expo only)
yarn build:plugin

# 4. Run tests
yarn test

# 5. Link to example app and rebuild it
cd example/bare
npm install  # Picks up new dist/ contents
yarn react-native run-android
```

---

## Script Commands Reference

All scripts are defined in `package.json`. Here's what each does and when to use it.

### Development & Testing

| Command | What it does | When to use |
|---------|------------|-----------|
| `yarn build` | Compile TS → JS, generate types | After code changes, before testing |
| `yarn build:plugin` | Compile Expo plugin | After editing plugin code |
| `yarn clean` | Remove `dist/` and build artifacts | If you get strange errors, or before fresh build |
| `yarn test` | Run Jest unit tests | Before committing, in CI |
| `yarn prepare` | Runs `build` (called by npm/yarn automatically) | Before `npm install` of this package |

### Linting & Type Checking

| Command | What it does | When to use |
|---------|------------|-----------|
| `yarn lint` | Check code style (ESLint) | Before committing |
| `yarn typecheck` | Check TypeScript types | Before committing |

### Publishing

| Command | What it does | When to use |
|---------|------------|-----------|
| `yarn prepublishOnly` | Runs final checks before npm publish | Before `npm publish` |
| `npm publish` | Upload package to npm registry | Release to public (requires npm access token) |

### Hidden Scripts (used by example apps)

When you link the SDK to example apps, these are called automatically:

| Command | Internal use |
|---------|---|
| `yarn codegen` | Generate TurboModule stubs (called during example app build) |

### Script Dependency Chain

```
developer runs yarn build
        ↓
expo-module build (wrapper script)
        ↓
tsup (TypeScript bundler)
  ├─→ tsc (compile TS)
  ├─→ writes dist/index.js (CommonJS)
  └─→ writes dist/index.mjs (ES Module)
        ↓
tsc --project tsconfig.build.json
  └─→ writes dist/src/**/*.d.ts (type declarations)
        ↓
dist/ is ready for consumption
```

### Why So Many Compile Steps?

1. **Codegen** – Generates native stubs (Java, C++, ObjC++)
2. **JS bundling** – Converts TS to JS for Node and Metro
3. **Type generation** – Creates `.d.ts` for consumers
4. **Plugin build** – Separate build for Expo plugin code

Each step is separate because:
- They operate on different file types
- They have different output locations
- They have different dependencies and tools
- Separating them makes CI faster (can cache between steps)

---

## Future Roadmap

### Contract Fabric Automation

**Goal:** Keep TypeScript types in sync with the Amply KMP SDK schema automatically.

**Current state:** NativeAmplyModule.ts is hand-written.

**Future state:**
1. KMP SDK emits a JSON schema of its public API
2. React Native SDK has a CLI tool that downloads the schema
3. CLI regenerates `NativeAmplyModule.ts`, types, Kotlin adapters
4. CI enforces schema doesn't drift (schema:check fails the build)

**Implementation steps (documented in CONTRACT_FABRIC_PIPELINE.md):**
- Add `schema-emitter` Gradle plugin to KMP repository
- Create `contract-fabric` CLI tool (Node.js)
- Add schema pull/generate/check commands to SDK
- Integrate into CI pipeline

**Benefits:**
- Breaking changes in KMP SDK are caught immediately
- New KMP API additions are available in React Native within days
- No manual type sync needed
- Self-documenting (types are ground truth)

### iOS Support

**Current state:** iOS placeholder with stub implementation

**Future steps:**
1. Amply ships iOS SDK (Swift + Objective-C++)
2. Mirror Kotlin implementation in Swift
3. Implement EventEmitter event streaming (Obj-C++)
4. Wire up deep link detection
5. Test with iOS example app

**No changes needed to:**
- JavaScript API (same for both platforms)
- TypeScript spec (works for all platforms)
- Expo plugin (already platform-agnostic)

### Advanced Features

These are deferred until the Amply KMP SDK exposes corresponding methods:

| Feature | What it does | Status |
|---------|-------------|--------|
| `identify(userId)` | Associate user ID with events | TODO (KMP SDK support needed) |
| `setUserProperty(key, value)` | Store persistent user attributes | TODO (KMP SDK support needed) |
| `flush()` | Send events immediately (don't wait for batch) | TODO (KMP SDK support needed) |
| `setLogLevel()` | Control SDK logging verbosity | TODO (KMP SDK support needed) |
| `trackSystemEvent()` | Manually emit system events | TODO (KMP SDK support needed) |

---

## Key Design Decisions Explained

### Decision 1: New Architecture Only

**Why?**
- Legacy Bridge is being phased out by React Native
- Reduces maintenance burden (one integration path, not two)
- TurboModule EventEmitters are more reliable than DeviceEventEmitter
- Unblocks iOS when the Amply iOS SDK arrives

**Tradeoff:**
- Requires React Native >= 0.79
- New Architecture must be enabled (one-time setup)
- Can't support older React Native projects

### Decision 2: Spec-Driven Codegen

**Why?**
- TypeScript is the source of truth for the contract
- Codegen ensures Java/C++/ObjC++ stubs are always in sync
- Type safety across JS-native boundary
- Makes it easy to add new methods (edit spec, run codegen, done)

**Tradeoff:**
- Must run codegen after any spec change
- Generates a lot of boilerplate code (OK, it's committed to git)

### Decision 3: TurboModule EventEmitters Only

**Why?**
- Works identically in Legacy Bridge and New Architecture
- Type-safe (event types defined in spec)
- No DeviceEventEmitter complexity
- Simpler testing (mock TurboModule event emitters)

**Tradeoff:**
- Can't use legacy patterns (no `NativeEventEmitter`)

### Decision 4: Wrapper Pattern (DefaultAmplyClient)

**Why?**
- Decouples React Native from KMP internals
- Allows adding RN-specific logic (lifecycle, permissions, etc.)
- Makes testing easier (mock the wrapper, not the KMP SDK)
- Isolates thread safety concerns

**Tradeoff:**
- Extra layer of indirection (minimal performance cost)
- Must maintain two interfaces (`AmplyClient`, `DefaultAmplyClient`)

### Decision 5: Separate Bare RN + Expo Paths

**Why?**
- Bare RN: Standard autolinking, full control
- Expo: Managed workflow, faster development, config plugin integration
- Same codebase works for both

**Tradeoff:**
- Must test both paths in CI
- Plugin code must handle Expo-specific concerns

---

## Maintenance & Contribution Guide

### Adding a New Method to the SDK

1. Add method to the `Spec` interface in `src/nativeSpecs/NativeAmplyModule.ts`
2. Update TypeScript API in `src/index.ts` (export wrapper)
3. Add type exports to spec file
4. Run `yarn codegen` to generate native stubs
5. Implement method in `android/src/main/java/com/amply/reactnative/AmplyModule.kt`
6. Write tests in `src/__tests__/`
7. Commit generated files + new code

### Adding System Event Type

1. Update `SystemEventPayload` type in spec
2. Update `DefaultAmplyClient` Kotlin code (if needed)
3. Run `yarn codegen`
4. Update `useAmplySystemEvents` hook if new filtering logic needed
5. Test in example app

### Diagnosing Module Loading Issues

```typescript
// If you get "Amply module not found":

// 1. Check react-native.config.js is in package root
// 2. Check MainApplication.java has import:
//    import com.amply.reactnative.AmplyPackage;
// 3. Check MainApplication.java has registration:
//    new AmplyPackage() in packages list
// 4. If using Expo, check app.json has plugin:
//    "plugins": ["@amply/amply-react-native"]
// 5. Rebuild completely:
//    yarn clean && yarn build && yarn react-native run-android
```

---

## Quick Reference

### Environment Requirements

- **Node.js:** >= 18
- **React Native:** >= 0.79 with New Architecture enabled
- **Expo:** >= 53 (for Expo apps)
- **Android API:** >= 24
- **Kotlin:** >= 1.9
- **Gradle:** >= 8.0

### File Organization Quick Guide

```
src/
  ├─ index.ts                    # Public API (what users import)
  ├─ nativeModule.ts             # Module loader
  ├─ systemEvents.ts             # Event listener helper
  ├─ hooks/
  │  └─ useAmplySystemEvents.ts # React hook
  └─ nativeSpecs/
     └─ NativeAmplyModule.ts     # TurboModule spec (authoritative!)

android/
  ├─ src/main/java/
  │  └─ com/amply/reactnative/
  │     ├─ AmplyModule.kt        # TurboModule implementation
  │     ├─ AmplyPackage.kt       # Package registration
  │     └─ core/
  │        └─ DefaultAmplyClient.kt  # KMP SDK wrapper
  └─ src/newarch/                # Generated by codegen

plugin/
  └─ src/withAmply.ts            # Expo config plugin

example/
  ├─ bare/                       # Bare React Native example
  └─ expo/                       # Expo example with expo-router
```

### Common Commands Cheat Sheet

```bash
# Development
yarn build              # Build JS + types
yarn build:plugin       # Build Expo plugin
yarn test              # Run tests
yarn lint              # Check style

# Codegen (only if you edited the spec!)
yarn codegen           # Generate native stubs

# Local testing
cd example/bare
npm install            # Pick up new dist/
yarn react-native run-android

# Publishing
yarn build && yarn test && yarn publish
```

---

## Development Credentials & Private Repositories

### GitHub Packages for Private SDK Versions

For specific development scenarios, the Amply React Native SDK can be published to GitHub Packages instead of npm. This is useful for:

- **Private patches**: Test bug fixes before public release
- **Pre-release versions**: Alpha/beta versions for early adopters
- **Team-only builds**: Restricted distribution to team members
- **SDK updates**: Testing updates that depend on unreleased KMP SDK versions

#### Configuration

To use a private GitHub Packages version, update your app's `package.json`:

```json
{
  "dependencies": {
    "@amply/amply-react-native": "^0.2.0-beta.1"
  },
  "resolutions": {
    "@amply/amply-react-native": "github:amply/react-native-sdk#main"
  }
}
```

Or install directly from a GitHub branch/tag:

```bash
yarn add @amply/amply-react-native@github:amply/react-native-sdk#feature/my-feature
```

#### GitHub Packages Authentication

To access private GitHub Packages, create a Personal Access Token (PAT):

1. **Generate Token** at https://github.com/settings/tokens
   - Scope: `read:packages`
   - Note: "Amply SDK Development"

2. **Configure npm/yarn** – Create `~/.npmrc`:
   ```
   //npm.pkg.github.com/:_authToken=ghp_xxxxxxxxxxxxxxxxxxxx
   @amply:registry=https://npm.pkg.github.com
   ```

3. **Or use environment variable**:
   ```bash
   export NPM_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
   yarn install
   ```

#### Publishing Private Versions

From the SDK repository:

```bash
# Build the package
yarn build && yarn test

# Publish to GitHub Packages (requires GitHub credentials)
npm publish --registry https://npm.pkg.github.com

# Or set in .npmrc and use:
npm publish
```

The package is published with scope `@amply` to GitHub Packages registry.

#### CI/CD Integration

For automated publishing to GitHub Packages in CI:

1. **Create GitHub Secret**: `GITHUB_TOKEN` (automatically available in Actions)

2. **Publish step** in GitHub Actions:
   ```yaml
   - name: Publish to GitHub Packages
     run: npm publish --registry https://npm.pkg.github.com
     env:
       NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
   ```

3. **Version strategy**:
   - Development: `0.x.x-dev.{timestamp}`
   - Pre-release: `0.x.x-alpha.1`, `0.x.x-beta.2`
   - Stable: `0.x.x` (published to npm instead)

#### Working with Private Versions

Example app using a development version:

```bash
# Install from a specific branch
yarn add @amply/amply-react-native@github:amply/react-native-sdk#main

# Or update to latest from branch
yarn upgrade @amply/amply-react-native@github:amply/react-native-sdk#develop

# Rebuild example
cd example/bare
yarn install
yarn react-native run-android
```

#### Troubleshooting GitHub Packages

**"401 Unauthorized" errors:**
- Verify PAT token is valid and hasn't expired
- Check `~/.npmrc` has correct token format
- Token must have `read:packages` scope minimum

**"404 Not Found":**
- Confirm package name is `@amply/amply-react-native`
- Package must be published to GitHub Packages registry
- Check repository visibility (private packages require authentication)

**Version not found:**
- Ensure version was published with `npm publish`
- Check GitHub Packages page for the version
- May need to wait a few seconds for replication

#### Advantages of GitHub Packages

| Aspect | npm | GitHub Packages |
|--------|-----|-----------------|
| **Stability** | Stable releases | Pre-release, experimental |
| **Access** | Public | Team/authenticated only |
| **Automation** | Manual workflow | Integrated with GitHub Actions |
| **Testing** | Production environment | CI/CD integration tests |
| **Rollback** | Unpublish restrictions | Easy branch switching |

#### When to Use Each Registry

**Use npm (public):**
- Production releases
- Stable versions
- Public samples
- Long-term support versions

**Use GitHub Packages (private):**
- Testing breaking changes
- Pre-release builds
- Patches for unreleased KMP SDK versions
- Team collaboration on features
- Early access for selected users

---

## Summary

The Amply React Native SDK demonstrates a modern, maintainable approach to React Native native modules:

✅ **Clean architecture** – Layered design with clear responsibilities
✅ **Type safety** – Spec-driven codegen ensures JS-native contract
✅ **Event streaming** – TurboModule EventEmitters, no fallbacks
✅ **Dual integration** – Works for Bare RN and Expo
✅ **Forward-looking** – Prepared for iOS, Contract Fabric automation
✅ **Developer experience** – Simple API, comprehensive types, good errors

The system events lifecycle is reliable and predictable, flowing from Kotlin → TurboModule → JavaScript with minimal latency. The build system is structured to be fast and modular, with clear separation between codegen, bundling, and testing.

For new contributors, understand these layers:
1. **TypeScript spec** is the contract
2. **Codegen** creates stubs
3. **Kotlin wrapper** does the work
4. **Event emitters** transport data
5. **Expo plugin** configures everything

For maintenance, keep the spec up-to-date, always run codegen after spec changes, and test both Bare and Expo paths.
