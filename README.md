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
| Last campaign touch (attribution in your analytics) | ✅ | Android, iOS |

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

// If your app picks its UI language itself (an in-app picker, i18next, …), tell Amply,
// so campaigns show in that language. Any common format: 'pt_BR', 'pt-BR', 'zh-TW', 'fr'.
// Persisted across launches; pass null to go back to following the device.
// Can also be given up front: Amply.initialize({ ..., appLanguage: 'pt_BR' }).
Amply.setAppLanguage('pt_BR'); // e.g. i18next's i18n.language

// Set custom properties for targeting
Amply.setCustomProperties({ plan: 'premium', onboarded: true });

// Listen for campaign deeplinks
const unsubscribe = await Amply.addDeepLinkListener((event) => {
  console.log('Deeplink:', event.url);
});
```

### Debug launch

Amply can open a campaign on a real device from a link or QR code made in the dashboard, so you
can click through it inside your app. The link uses your app's URL scheme, so the app has to pass
incoming links to Amply:

```typescript
import {Linking} from 'react-native';
import Amply from '@amplytools/react-native-amply-sdk';

const forward = (url: string | null) => {
  if (url && Amply.handleUrl(url)) {
    return; // an Amply link: Amply took it, do not route it
  }
  // ...your own link handling
};

Linking.getInitialURL().then(forward);
Linking.addEventListener('url', ({url}) => forward(url));
```

`handleUrl` returns `true` when Amply recognised the link as its own, and `false` for any other
link (it never throws). It is fine to call it before `initialize` finishes, as on a cold start: an Amply link that arrives early is held (the newest one) and opened as soon as `initialize` succeeds; it is dropped if `initialize` fails. A
campaign launched this way is not counted in statistics.

With Expo Router, links are routed before your code sees them, so forward only from
`app/+native-intent.tsx` (and do not also forward with `Linking` above). An Amply link reaches the
SDK instead of the not-found screen, and every other link is routed as usual:

```typescript
import Amply from '@amplytools/react-native-amply-sdk';

export function redirectSystemPath({path}: {path: string; initial: boolean}) {
  if (Amply.handleUrl(path)) {
    return '/'; // an Amply link: Amply took it
  }
  return path;
}
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
