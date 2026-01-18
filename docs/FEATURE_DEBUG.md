# Debug Feature Implementation Summary

## Overview

This document summarizes the implementation of the debug/logging feature for the Amply React Native SDK, as requested in `AMPLY_SDK_DEBUG_FEATURE_REQUEST.md`.

## Architecture Decision

**Chosen Approach**: Centralized logging in KMP SDK with event-based forwarding to React Native.

Instead of implementing logging separately in Android/iOS React Native wrappers, all logging originates from the KMP SDK and is forwarded to JS via the existing system events mechanism. This approach:
- Centralizes logging logic in one place
- Enables campaign evaluation logging (only possible in KMP SDK)
- Reduces code duplication across platforms

---

## Files Changed

### 1. KMP SDK (multiplatform-library-template)

#### New File: `library/src/commonMain/kotlin/tools/amply/sdk/logging/Logger.kt`

Created a complete logging infrastructure:

```kotlin
// Log levels
enum class LogLevel(val level: Int) {
    NONE(0), ERROR(1), WARN(2), INFO(3), DEBUG(4)
}

// Log categories for filtering
object LogCategory {
    const val SDK = "sdk"
    const val EVENT = "event"
    const val CAMPAIGN = "campaign"
    const val CONFIG = "config"
    const val SESSION = "session"
    const val DEEPLINK = "deeplink"
    const val NETWORK = "network"
}

// Log entry data class
data class LogEntry(
    val level: LogLevel,
    val category: String,
    val message: String,
    val timestamp: Long,
    val details: Map<String, Any>? = null
)

// Listener interface for log events
interface LogListener {
    fun onLog(entry: LogEntry)
}

// Singleton logger
object Logger {
    var currentLevel: LogLevel = LogLevel.NONE
    private var listener: LogListener? = null

    fun setLevel(level: LogLevel)
    fun setListener(listener: LogListener?)
    fun log(level: LogLevel, category: String, message: String, details: Map<String, Any>? = null)

    // Convenience methods
    fun debug(category: String, message: String, ...)
    fun info(category: String, message: String, ...)
    fun warn(category: String, message: String, ...)
    fun error(category: String, message: String, ...)
}
```

#### Modified: `library/src/commonMain/kotlin/tools/amply/sdk/campaigns/CampaignManager.kt`

Added campaign evaluation logging:

```kotlin
// In fetchCampaigns()
Logger.info(LogCategory.CONFIG, "Config fetch started")
Logger.info(LogCategory.CONFIG, "Config fetch completed: ${campaigns.size} campaigns loaded")

// In activate()
Logger.debug(LogCategory.CAMPAIGN, "Evaluating ${campaigns.size} campaigns for event: ${event.name}")
Logger.debug(LogCategory.CAMPAIGN, "Campaign \"${name}\": targeting rules not satisfied")
Logger.debug(LogCategory.CAMPAIGN, "Campaign \"${name}\": trigger MATCHED for event ${event.name}")
Logger.info(LogCategory.CAMPAIGN, "Campaign \"${name}\": MATCH - executing action")
```

#### Modified: `library/src/androidMain/kotlin/tools/amply/sdk/Amply.kt`

Added logging API methods:

```kotlin
fun setLogLevel(level: LogLevel)
fun setLogLevel(level: String?)
fun getLogLevel(): LogLevel
fun setLogListener(listener: LogListener?)
```

#### Modified: `library/src/iosMain/kotlin/tools/amply/sdk/Amply.kt`

Added same logging API methods as Android.

---

### 2. React Native SDK (react-native-sdk)

#### Modified: `src/nativeSpecs/NativeAmplyModule.ts`

Added TypeScript types and TurboModule methods:

```typescript
// New type
export type LogLevel = 'none' | 'error' | 'warn' | 'info' | 'debug';

// Extended AmplyInitializationConfig
export type AmplyInitializationConfig = {
  // ... existing fields ...
  debug?: boolean | null;      // Shorthand for logLevel: 'debug'
  logLevel?: LogLevel | null;  // Takes precedence over debug
};

// New methods in Spec
setLogLevel(level: string): void;
getLogLevel(): string;
```

#### Modified: `src/index.ts`

Added JS-side debug log handling:

```typescript
// Debug log listener that outputs to Metro console
function ensureDebugLogListener(): void {
  addSystemEventListenerInternal((event) => {
    if (event.name === 'DebugLog') {
      // Format and output to appropriate console method
      const level = event.properties.level;
      switch (level) {
        case 'error': console.error(formattedLog); break;
        case 'warn': console.warn(formattedLog); break;
        case 'debug': console.debug(formattedLog); break;
        default: console.log(formattedLog);
      }
    }
  });
}

// Exported functions
export function setLogLevel(level: LogLevel): void;
export function getLogLevel(): LogLevel;
```

#### Modified: `android/src/main/java/tools/amply/sdk/reactnative/model/AmplyInitializationOptions.kt`

Added LogLevel enum and config parsing:

```kotlin
enum class LogLevel(val level: Int) {
    NONE(0), ERROR(1), WARN(2), INFO(3), DEBUG(4);

    companion object {
        fun fromString(value: String?): LogLevel
    }
}

data class AmplyInitializationOptions(
    // ... existing fields ...
    val debug: Boolean?,
    val logLevel: LogLevel?,
) {
    fun getEffectiveLogLevel(): LogLevel
}
```

#### Modified: `android/src/main/java/tools/amply/sdk/reactnative/core/AmplyClient.kt`

Added interface methods:

```kotlin
val logEvents: SharedFlow<EventEnvelope>
fun setLogLevel(level: LogLevel)
fun getLogLevel(): LogLevel
```

#### Modified: `android/src/main/java/tools/amply/sdk/reactnative/core/DefaultAmplyClient.kt`

- Set up LogListener during initialization to forward logs to JS
- Implemented setLogLevel/getLogLevel methods
- Added logEvents SharedFlow

#### Modified: `android/src/main/java/tools/amply/sdk/reactnative/AmplyModule.kt`

- Added log event collection job
- Implemented setLogLevel/getLogLevel TurboModule methods
- Forward log events to JS via emitOnSystemEvent

#### Modified: `ios/Sources/AmplyReactNative/AmplyModule.mm`

- Added AmplyLogLevel enum and helper functions
- Implemented ASDKLogListener protocol
- Added setLogLevel/getLogLevel methods
- Added registerLogListenerInternal for log forwarding
- Implemented ASDKSystemEventsListener for system events (fixes iOS gap)

---

## Usage

### Initialize with Debug Mode

```typescript
import Amply from '@anthropic/react-native-amply-sdk';

// Option 1: Simple debug flag
await Amply.initialize({
  appId: 'my-app-id',
  apiKeyPublic: 'my-public-key',
  debug: true,  // Enables all logging
});

// Option 2: Specific log level
await Amply.initialize({
  appId: 'my-app-id',
  apiKeyPublic: 'my-public-key',
  logLevel: 'info',  // Only info, warn, error
});
```

### Change Log Level at Runtime

```typescript
// Enable debug logging
Amply.setLogLevel('debug');

// Disable logging
Amply.setLogLevel('none');

// Check current level
const level = Amply.getLogLevel(); // 'debug'
```

### Console Output Example

When debug mode is enabled, developers see logs in Metro console:

```
[Amply INFO] [sdk] SDK initializing with appId=my-app-id
[Amply INFO] [config] Config fetch started
[Amply INFO] [config] Config fetch completed: 3 campaigns loaded
[Amply DEBUG] [campaign] Campaign loaded: "Welcome Offer" (camp_123)
[Amply DEBUG] [campaign] Evaluating 3 campaigns for event: ButtonTapped
[Amply DEBUG] [campaign] Campaign "rate_review": targeting rules not satisfied
[Amply DEBUG] [campaign] Campaign "welcome_offer": trigger MATCHED for event ButtonTapped
[Amply INFO] [campaign] Campaign "welcome_offer": MATCH - executing action
```

---

## Log Level Hierarchy

| Level | Value | Includes |
|-------|-------|----------|
| `none` | 0 | Nothing |
| `error` | 1 | Errors only |
| `warn` | 2 | Errors + Warnings |
| `info` | 3 | Errors + Warnings + Info (SDK lifecycle) |
| `debug` | 4 | Everything (including campaign evaluation) |

---

## Data Flow

```
KMP SDK (Kotlin)
    │
    ├── Logger.log() called
    │       │
    │       ├── Check if level enabled
    │       │       │
    │       │       └── If enabled: Create LogEntry
    │       │               │
    │       │               ├── Print to native console (always)
    │       │               │
    │       │               └── Call listener.onLog(entry)
    │       │
    └── LogListener (set by RN wrapper)
            │
            └── Convert to EventEnvelope
                    │
                    ├── Android: emit to logEvents SharedFlow
                    │       │
                    │       └── AmplyModule collects and emits to JS
                    │
                    └── iOS: call emitOnSystemEvent directly
                            │
                            └── JS receives via onSystemEvent
                                    │
                                    └── If event.name === 'DebugLog'
                                            │
                                            └── Output to console.log/warn/error/debug
```

---

## Known Issues / TODO

1. **KMP SDK Tests Failing**: Some session-related tests are failing after the changes. Need to investigate if this is related to Logger import or pre-existing issues.

2. **iOS Log Listener Protocol**: The `ASDKLogListener` protocol may not be exported from the KMP SDK XCFramework yet. Will need to verify after building the iOS framework.

3. **Codegen**: The TurboModule codegen needs to be run during native build to generate the setLogLevel/getLogLevel bindings.

---

## Improvements Over Original Request

| Original Issue | Resolution |
|----------------|------------|
| Option A vs B undecided | Used Option A (System Events) - logs forwarded via existing channel |
| `debug` + `logLevel` conflict | `logLevel` takes precedence; `debug: true` is alias for `logLevel: 'debug'` |
| KMP SDK has no logging framework | Created `Logger` singleton with levels, categories, and listener interface |
| Campaign evaluation silent | Added detailed logging in `CampaignManager.activate()` |
| iOS system events gap | Fixed - iOS now properly implements `ASDKSystemEventsListener` |
| Centralized logging | All logs originate from KMP SDK, ensuring consistency |
