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

The SDK autolinks on both bare React Native and Expo — no manual `MainApplication` edits, and no `app.json` plugin entry unless you use [built-in campaigns](#built-in-campaigns-expo).

For Expo apps you may still need a rebuild after install:

```bash
npx expo prebuild --clean
npx expo run:android   # or run:ios
```

If you upgraded from v0.2.11 or earlier and have the historical `"@amply/amply-react-native"` in your `plugins` array — remove it. An existing `"@amplytools/react-native-amply-sdk"` entry is harmless: the plugin does nothing unless the project has built-in campaign bundles.

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

## Built-in campaigns (Expo)

A campaign marked **Built-in** in Amply ships inside your app binary, so it can show on the very
first launch, before the device has ever reached Amply.

1. Add the plugin to `app.json`:

   ```json
   { "expo": { "plugins": ["@amplytools/react-native-amply-sdk"] } }
   ```

2. Pull the bundles with your applications' public API keys:

   ```bash
   npx @amplytools/cli bundle --android <android-public-key> --ios <ios-public-key>
   ```

   This writes `amply-bundle.android.json` and `amply-bundle.ios.json` next to `app.json`, plus
   `amply.json` (the keys, no secrets) so later runs need no arguments. Commit all three, and
   re-run the command before each release to pick up campaign changes.

3. Rebuild the app: `npx expo prebuild`, then `npx expo run:android` / `run:ios` (EAS Build runs
   prebuild for you).

At prebuild the plugin copies the Android file to `android/app/src/main/assets/amply-bundle.json`
and adds the iOS file to the app target as the resource `amply-bundle.json` — the only places the
SDK looks. A platform without its file is left untouched.

In a bare React Native project you do not need the plugin: the CLI writes into
`android/app/src/main/assets/` and your iOS app folder directly. On iOS add that file to the app
target once in Xcode; the CLI warns until you do.

## Documentation

Full integration guides, API reference, and examples:

**[docs.amply.tools](https://docs.amply.tools)**

## Contributing

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for development setup and contribution guidelines.

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.
