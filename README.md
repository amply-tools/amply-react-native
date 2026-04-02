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

For Expo, add the plugin to `app.json`:

```json
{
  "expo": {
    "plugins": ["@amplytools/react-native-amply-sdk"]
  }
}
```

## Quick Start

```typescript
import Amply from '@amplytools/react-native-amply-sdk';

// Initialize
await Amply.initialize({
  appId: 'YOUR_APP_ID',
  apiKeyPublic: 'YOUR_PUBLIC_API_KEY',
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

## Documentation

Full integration guides, API reference, and examples:

**[docs.amply.tools](https://docs.amply.tools)**

## Contributing

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for development setup and contribution guidelines.

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.
