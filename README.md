# Amply React Native SDK

React Native TurboModule bridge for the Amply SDK. Enables event tracking, deeplink campaigns, and real-time data collection in React Native apps.

## Features

| Feature | Status | Platform |
|---------|--------|----------|
| Event tracking | ✅ | Android, iOS |
| Deeplink campaigns | ✅ | Android, iOS |
| System events API | ✅ | Android, iOS |
| Data inspection | ✅ | Android, iOS |
| Debug/Logging | ✅ | Android, iOS |
| Custom properties | ✅ | Android, iOS |
| User identification | ✅ | Android, iOS |

## Requirements

- React Native >= 0.79 (New Architecture enabled)
- Expo SDK >= 53 (for Expo apps)
- Android API 24+ / iOS 13.0+

## Installation

```bash
yarn add @amplytools/react-native-amply-sdk
```

The SDK autolinks on both bare React Native and Expo — no `app.json` plugin entry, no manual `MainApplication` edits.

For Expo apps you may still need a rebuild after install:

```bash
npx expo prebuild --clean
npx expo run:android   # or run:ios
```

If you upgraded from v0.2.11 or earlier and have `"@amplytools/react-native-amply-sdk"` (or the historical `"@amply/amply-react-native"`) in your `plugins` array — remove it. The config plugin is now a no-op kept only for backward compatibility.

## Quick Start

```typescript
import Amply from '@amplytools/react-native-amply-sdk';

// Initialize — all three keys are required (your application's page in Amply).
// Use the iOS application's keys on iOS and the Android application's on Android.
await Amply.initialize({
  appId: 'YOUR_APP_ID',
  apiKeyPublic: 'YOUR_PUBLIC_API_KEY',
  apiKeySecret: 'YOUR_SECRET_API_KEY',
  debug: true, // optional: enable debug logging
});

// Track events
await Amply.track({
  name: 'Button Tapped',
  properties: { screen: 'home' },
});

// Identify users
Amply.setUserId('user-123');

// Set custom properties for targeting
Amply.setCustomProperties({ plan: 'premium', onboarded: true });

// Listen for campaign deeplinks
const unsubscribe = await Amply.addDeepLinkListener((event) => {
  console.log('Deeplink:', event.url);
});
```

### About the keys

`apiKeySecret` ships inside your app: the SDK signs every request with it on the device. Keep it
out of source control and inject it at build time, like the public key. If any of the three keys
is missing or blank, `initialize` rejects with `AMP_INVALID_CONFIG`, logs which key is missing,
and Amply stays off — every later call is a no-op. It never crashes your app.

## Documentation

Full integration guides, API reference, and examples:

**[docs.amply.tools](https://docs.amply.tools)**

## Contributing

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for development setup and contribution guidelines.

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.
