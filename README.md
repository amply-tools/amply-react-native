# Amply React Native SDK

A React Native TurboModule bridge for the Amply Kotlin Multiplatform SDK with full New Architecture support. Enables event tracking, deeplink campaign handling, and real-time data collection in React Native apps.

## What is Amply?

Amply is a customer data collection and analytics platform. This SDK provides a React Native bridge to the Amply native SDKs, allowing you to:

- **Track events** from your React Native app to Amply
- **Handle deeplink campaigns** with automatic route resolution
- **Access system events** for monitoring and debugging
- **Manage user data** through native APIs
- **Inspect collected data** in real-time

## Current Status

| Feature | Status | Platform |
|---------|--------|----------|
| Event tracking | ✅ Complete | Android, iOS |
| Deeplink campaigns | ✅ Complete | Android, iOS |
| System events API | ✅ Complete | Android, iOS |
| Data inspection | ✅ Complete | Android, iOS |
| Advanced API (identify, setUserProperty, flush) | ⏳ Pending | Android, iOS |

**Requirements:**
- React Native >= 0.79 (New Architecture enabled)
- Expo SDK >= 53 (for Expo apps)
- Android API 24+
- iOS 13.0+

---

## Installation Guide

### Step 1: Install the Package

```bash
yarn add @amply/amply-react-native
```

### Step 2: Configure Your App

Choose one of the approaches below based on your app type.

---

## Expo Integration Guide

### How It Works

The Amply SDK uses **React Native's standard autolinking** mechanism for both Bare RN and Expo:

1. **Native discovery**: `react-native.config.js` tells React Native where to find native code
2. **Gradle integration**: Expo's autolinking system includes the Amply module as a gradle subproject
3. **Package registration**: Expo config plugin registers `AmplyPackage` in the generated `MainApplication.kt` during prebuild
4. **Runtime loading**: React Native automatically loads the TurboModule

No manual configuration needed - it's fully automatic!

### Prerequisites
- Expo SDK 53+
- Node.js 18+
- Android SDK/emulator or physical device
- iOS 13.0+ / Xcode 14+ (for iOS development)

### Quick Setup (3 Steps)

**Step 1: Install the package**

```bash
yarn add @amply/amply-react-native
```

**Step 2: Add plugin to app.json**

```json
{
  "expo": {
    "plugins": [
      "@amply/amply-react-native"
    ]
  }
}
```

The plugin declaration is required by Expo for security (prevents arbitrary code execution). Even though the plugin is lightweight, explicitly declaring it in your config is a best practice that prevents unexpected behavior during prebuild.

**Step 3: Prebuild and run**

```bash
expo prebuild --clean    # (~2-3 minutes, one-time only)
expo start               # Terminal 1: Start dev server
expo run:android         # Terminal 2: Build and run (Android)
expo run:ios             # Terminal 2: Build and run (iOS)
```

That's it! The Amply SDK is automatically configured via React Native's autolinking mechanism. Setup is one-time only (~3 minutes total).

## Bare React Native Integration Guide

### Prerequisites
- React Native 0.79+ with **New Architecture enabled**
- Android API level 24+
- Android Gradle Plugin 7.0+
- Gradle 7.0+
- iOS 13.0+ / Xcode 14+

**Enable New Architecture:**

Set `newArchEnabled=true` in `android/gradle.properties`:

```properties
newArchEnabled=true
```

### Setup Steps

**1. Install the package:**

```bash
yarn add @amply/amply-react-native
```

**2. Verify or create `react-native.config.js` at project root:**

```javascript
module.exports = {
  project: {
    ios: {},
    android: {},
  },
};
```

This enables React Native's autolinking mechanism to discover the Amply module.

**3. Rebuild:**

```bash
yarn react-native run-android    # Android
yarn react-native run-ios        # iOS
```

**4. Verify successful integration:**

Check the build logs for:

```
✅ Successfully compiled AmplyReactNative TurboModule
✅ Building APK
✅ Installing APK
```

Or check logs after app starts:

```bash
adb logcat | grep -i "amply\|turbomodule"
```

You should see: `TurboModule 'Amply' loaded successfully`


## Sample Apps

The SDK includes two fully-functional example apps for reference and contribution.

### Bare React Native Sample (`example/bare`)

A traditional React Native CLI app demonstrating all SDK features.

**What it shows:**
- Event tracking with UI feedback
- Deeplink campaign handling
- System event logging
- Device dataset inspection
- Auto-initialization toggle

**How to run:**

```bash
cd example/bare

# Install dependencies
yarn install

# Build and run on device/emulator
yarn react-native run-android    # Android
yarn react-native run-ios        # iOS
```

**Key files:**
- `android/app/src/main/AndroidManifest.xml` - Intent filter for deeplinks
- `src/hooks/useAmplyDemo.ts` - Demo hook for tracking and deeplink testing
- `src/utils/amplyDeepLinkRouter.ts` - Deeplink routing logic

### Expo Sample (`example/expo`)

A complete Expo app with file-based routing (`expo-router`) demonstrating all SDK features with Expo's New Architecture support.

**What it shows:**
- Event tracking with real-time UI feedback
- Deeplink campaign handling with automatic routing
- System event monitoring
- Device dataset inspection
- AsyncStorage persistence for user preferences
- File-based routing with expo-router
- Hot reload for development

**Key features:**
- New Architecture enabled by default
- Automatic deeplink-to-route resolution
- AsyncStorage persistence for settings
- Real-time logs of all SDK events

**Key files:**
- `app/` - expo-router file-based routing
- `app/_layout.tsx` - Root layout with Stack navigation
- `app/promo/[id].tsx` - Dynamic promo screen route from deeplinks
- `src/hooks/useAmplyDemo.ts` - Main hook handling initialization, tracking, and listeners
- `src/utils/amplyDeepLinkRouter.ts` - Deeplink routing logic

**Running the Expo Sample:**

The example app already has the plugin configured in `expo.config.js`:

```bash
cd example/expo
yarn install
expo prebuild --clean   # Plugin runs automatically
expo start              # Terminal 1
expo run:android        # Terminal 2 (Android)
expo run:ios            # Terminal 2 (iOS)
```

**Note for SDK Developers:**

When modifying the SDK and testing:

1. Build the SDK: `yarn build` (from root)
2. Test with example:
   ```bash
   cd example/expo
   rm -rf android ios         # Clean native code
   expo prebuild --clean      # Plugin runs automatically via config
   expo start                 # Terminal 1
   expo run:android           # Terminal 2 (Android)
   expo run:ios               # Terminal 2 (iOS)
   ```

The config plugin in `expo.config.js` automatically runs during `expo prebuild`.

---

## SDK API Reference

### Initialization

Initialize the SDK before using any other features.

```typescript
import Amply from '@amply/amply-react-native';

async function initAmply() {
  try {
    await Amply.initialize({
      appId: 'YOUR_APP_ID',
      apiKeyPublic: 'YOUR_PUBLIC_API_KEY',
      apiKeySecret: 'YOUR_SECRET_API_KEY', // optional
    });
    console.log('Amply initialized');
  } catch (error) {
    console.error('Initialization failed:', error);
  }
}

// Call on app startup
initAmply();
```

### Event Tracking

Track user actions and custom events.

```typescript
// Simple event
await Amply.track({
  name: 'Button Tapped',
});

// Event with properties
await Amply.track({
  name: 'Purchase Completed',
  properties: {
    amount: 99.99,
    currency: 'USD',
    itemCount: 3,
  },
});

// Common events
await Amply.track({
  name: 'App Opened',
  properties: {
    version: '1.0.0',
  },
});

await Amply.track({
  name: 'User Signed In',
  properties: {
    method: 'email',
    provider: 'google',
  },
});
```

### Deeplink Campaigns

The Amply SDK automatically triggers deeplinks from marketing campaigns. Your app's router already handles navigation to the correct screen based on the deeplink URL.

You need a listener to implement **custom business logic** when a campaign deeplink is received:

**Valid use cases:**

- **Authentication check**: Redirect to login if the deeplink points to gated content
- **Analytics tracking**: Log which campaign brought the user in
- **Custom logic**: Apply discount codes, update user state, sync data, etc.

**Understanding `event.consumed`:**

The `consumed` flag indicates whether Amply SDK has already processed the deeplink internally. Currently, it's always `false`, meaning your listener will always receive and process the deeplink.

This flag is included for **future improvements** where Amply SDK could control whether the app listener should handle the deeplink:
- `consumed = true`: Amply handled this deeplink internally → skip your custom logic
- `consumed = false`: Deeplink available for your app to process

**Always check the flag** to future-proof your implementation:

```typescript
if (!event.consumed) {
  // Your custom logic: analytics, authentication, state updates, etc.
}
```

**Implementation:**

```typescript
import Amply from '@amply/amply-react-native';

let unsubscribe: (() => void) | null = null;

async function setupDeeplinkListener() {
  unsubscribe = await Amply.addDeepLinkListener((event) => {
    console.log('Campaign deeplink received:', event.url);
    // Example: amplybare://campaign/promo/black-friday

    if (!event.consumed) {
      // Handle custom business logic
      handleCampaignDeeplink(event.url);
    }
  });
}

function handleCampaignDeeplink(deeplink: string) {
  // Example 1: Check authentication for gated content
  if (deeplink.includes('/premium/') && !user?.isLoggedIn) {
    navigation.navigate('Login');
    return;
  }

  // Example 2: Track campaign analytics
  const campaignId = deeplink.split('/').pop();
  await Amply.track({
    name: 'Campaign Deeplink Opened',
    properties: {
      campaignId,
      deeplink,
    },
  });

  // Example 3: Custom logic - unlock achievement
  if (deeplink.includes('/achievement/unlock/')) {
    const achievementId = deeplink.split('/').pop();
    store.achievements.unlock(achievementId);
    showAchievementNotification(achievementId);

    // Track the unlock event
    await Amply.track({
      name: 'Achievement Unlocked',
      properties: {
        achievementId,
        source: 'campaign_deeplink',
      },
    });
  }
}

// Call on app startup (after initialization)
setupDeeplinkListener();

// Clean up
function cleanup() {
  if (unsubscribe) {
    unsubscribe();
  }
}
```

**Testing deeplinks with ADB:**

```bash
# Test campaign promo
adb shell am start \
  -a android.intent.action.VIEW \
  -d "amplybare://campaign/promo/black-friday" \
  com.yourapp

# Test achievement unlock
adb shell am start \
  -a android.intent.action.VIEW \
  -d "amplybare://campaign/achievement/unlock/first-login" \
  com.yourapp
```

### System Events

Monitor low-level events from the native SDK.

```typescript
import Amply, { useAmplySystemEvents, formatSystemEventLabel } from '@amply/amply-react-native';

// Method 1: Direct listener
const unsubscribe = await Amply.systemEvents.addListener((event) => {
  console.log('System event:', event.name, event.properties);
});

// Method 2: React hook (preferred for UI)
function EventLog() {
  const { events, clear } = useAmplySystemEvents({
    maxEntries: 200,
    onEvent: (event) => {
      console.log(formatSystemEventLabel(event));
    },
  });

  return (
    <View>
      {events.map((event) => (
        <Text key={event.id}>
          {formatSystemEventLabel(event)}
        </Text>
      ))}
      <Button title="Clear" onPress={clear} />
    </View>
  );
}
```

### Data Inspection

Inspect collected data in real-time.

```typescript
// Get recent events (last 100)
const events = await Amply.getRecentEvents();
console.log('Recent events:', events);

// Get data snapshot
const snapshot = await Amply.getDataSetSnapshot();
console.log('Dataset snapshot:', snapshot);
```

### Check Initialization Status

```typescript
const isInitialized = await Amply.isInitialized();
console.log('SDK initialized:', isInitialized);
```

---

## Development

### Project Structure

```
src/                               # TypeScript source (JS side)
  ├── nativeSpecs/
  │   └── NativeAmplyModule.ts     # TurboModule spec (codegen source)
  ├── index.ts                      # Public API exports
  ├── nativeModule.ts               # Native module loader with fallbacks
  └── systemEvents.ts               # Event emitter helpers

android/                           # Android native code
  ├── src/main/
  │   ├── java/com/amply/reactnative/
  │   │   ├── AmplyModule.kt        # TurboModule implementation
  │   │   ├── AmplyPackage.kt       # Package for React Native
  │   │   └── core/                 # Amply SDK wrapper
  │   └── jni/
  │       └── CMakeLists.txt        # C++ build config
  └── src/newarch/                  # Auto-generated codegen artifacts
      ├── java/
      │   └── NativeAmplyModuleSpec.java
      └── jni/
          ├── CMakeLists.txt
          ├── AmplyReactNative.h
          └── AmplyReactNative-generated.cpp

ios/                               # iOS native code
  ├── AmplyReactNative.podspec      # CocoaPods spec
  └── Sources/AmplyReactNative/
      ├── AmplyModule.mm            # TurboModule implementation
      ├── Amply/                    # Codegen artifacts
      │   ├── Amply.h
      │   └── Amply-generated.mm
      └── AmplyReactNative/         # Module header and codegen
          ├── AmplyReactNative.h
          └── AmplyReactNative-generated.mm

example/bare/                      # Bare RN example app
  └── android/                      # Native setup for bare RN

example/expo/                      # Expo example app
  ├── scripts/
  │   └── setup-amply.js                # Post-prebuild setup script
  ├── babel.config.js                   # Babel configuration
  ├── metro.config.js                   # Metro bundler config
  └── expo.config.js                    # Expo configuration with plugin

plugin/                            # Expo config plugin source
  ├── src/
  │   ├── withAmply.ts              # Main plugin logic (registers AmplyPackage via withMainApplication hook)
  │   └── index.ts                  # Plugin export
  ├── build/                         # Compiled plugin (generated)
  ├── tsconfig.json                 # TypeScript config for plugin
  └── tsconfig.tsbuildinfo          # Build metadata

scripts/
  ├── codegen.js                    # Code generation wrapper
  └── setup-expo.js                 # CLI command: npx amply-setup-expo
```

### Build Commands

```bash
# Generate TypeScript → Java/C++ bindings
yarn codegen

# Build TypeScript distribution
yarn build

# Run tests
yarn test

# Lint and type check
yarn lint && yarn typecheck
```

### Using Sample Apps for SDK Development

The sample apps (`example/bare` and `example/expo`) are the primary testing environments for SDK development. They use the `link:` protocol in `package.json` to reference the local SDK source for rapid iteration:

```json
{
  "dependencies": {
    "@amply/amply-react-native": "link:../.."
  }
}
```

**This allows SDK developers to:**
- Make changes to SDK source and see them immediately in sample apps
- Test spec changes with `yarn codegen`
- Test native code changes without rebuilding the library
- Verify both Expo and bare RN integrations work correctly

**When to use each sample:**
- **Expo:** Fast iteration, hot reload, local SDK development
- **Bare:** Production-like testing, intent filter testing, real-world scenario

> **Important:** Do not use `link:` protocol in regular apps. Regular developers should install from npm: `yarn add @amply/amply-react-native`

### Contributing Workflow

**1. Setup workspace:**

```bash
yarn install
yarn codegen
```

**2. Make changes to SDK:**

```bash
# For native interface changes
nano src/nativeSpecs/NativeAmplyModule.ts
yarn codegen

# For implementation changes
nano android/src/main/java/com/amply/reactnative/AmplyModule.kt

# For JS changes
nano src/index.ts
```

**3. Test with sample apps:**

The sample apps are pre-configured with `link:` protocol for local SDK development.

```bash
# Expo app (recommended for iteration)
cd example/expo
yarn install
expo prebuild --clean    # Plugin runs via expo.config.js
expo start               # Terminal 1
expo run:android         # Terminal 2 (Android)
expo run:ios             # Terminal 2 (iOS)

# Bare RN app (for production validation)
cd example/bare
yarn install
yarn react-native run-android    # Android
yarn react-native run-ios        # iOS
```

**Recommended development workflow:**

```bash
# 1. Make changes to SDK
nano src/nativeSpecs/NativeAmplyModule.ts

# 2. If spec changed, regenerate artifacts
yarn codegen

# 3. Test with Expo (faster feedback)
cd example/expo
rm -rf android ios       # Clean native code
expo prebuild --clean    # Plugin runs automatically via config
expo start               # Terminal 1
expo run:android         # Terminal 2 (Android)
expo run:ios             # Terminal 2 (iOS)

# 4. Once working, test with bare RN
cd ../bare
yarn install
yarn react-native run-android    # Android
yarn react-native run-ios        # iOS
```

**4. PR checklist:**

- [ ] Changes tested in both example apps
- [ ] `yarn lint && yarn typecheck && yarn test` passes
- [ ] Codegen artifacts committed (if spec changed)
- [ ] Commit messages are clear
- [ ] No breaking changes (or documented)

---

## Deeplink Configuration (Bare RN Only)

For bare React Native apps, add intent filters to handle deeplinks.

**Update `android/app/src/main/AndroidManifest.xml`:**

```xml
<activity
    android:name=".MainActivity"
    android:exported="true"
    android:launchMode="singleTask">

  <intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <!-- Define your schemas below -->
    <data
        android:scheme="amply"
        android:host="campaign"
        android:pathPrefix="/" />
  </intent-filter>
</activity>
```

**For Expo apps:** Deeplinks are handled automatically via `app.json` configuration.

---

## Contributing

Contributions are welcome! Please follow the development workflow above.

**Setup:**
```bash
yarn install
yarn codegen
```

**Before submitting a PR:**
- Test with both example apps
- Run `yarn lint && yarn typecheck`
- Verify no breaking changes
- Update README if API changes

---

## License
This SDK is licensed under the Apache License 2.0.

You may use, modify, and distribute this software in compliance with the terms of the license.
See the [LICENSE](LICENSE) file for full details.

© Amply. 2025
