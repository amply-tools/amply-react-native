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
- Android API 24+ / iOS 15.1+
- iOS: static linking (the Expo default, or `use_frameworks! :linkage => :static`)

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

### iOS: where the native SDK comes from

The native `AmplySDK` framework arrives as the Swift package [`amply-sdk-ios`](https://github.com/amply-tools/amply-sdk-ios), which React Native attaches during `pod install` (its built-in `spm_dependency`). There is nothing to add to your `Podfile`, and each version of this package pins the exact native version it was tested with.

- **Do not add `AmplySDK` yourself** — as a pod or a Swift package. This package already brings the version it was tested with; a second source competes with it, and which version the app then links is up to the linker.
- **Static linking only.** The default React Native and Expo setups, and `use_frameworks! :linkage => :static` (`"useFrameworks": "static"` in `expo-build-properties`), all work. A dynamic-framework build stops with a compile error naming the setting.
- **The first iOS build downloads the framework** (about 24 MB) from `github.com` and `release-assets.githubusercontent.com`; later builds use Xcode's package cache. EAS Build and hosted CI have that access. A CI that blocks outbound traffic needs both hosts allowed, or a cache of Xcode's package directory (`xcodebuild -clonedSourcePackagesDirPath <dir>`).
- **Archives (EAS Build, Xcode Organizer) need nothing extra.** The pod adds a build phase, `[Amply] Remove duplicate AmplySDK archive signature`, that works around an Xcode archive error with Swift packages used by pods ("AmplySDK.xcframework-ios.signature couldn't be copied to Signatures"). It does nothing in ordinary builds.
- **React Native's Swift Package Manager mode** (RN 0.87+, `npx react-native spm`, the default from RN 0.89) is supported too: the package ships `ios/Package.swift`, which the SPM autolinker picks up on its own and which pins the same native version. It uses React Native's default local mode; the remote React package mode (`RN_SPM_REMOTE_URL`) is not supported yet.
- **Upgrading from 0.17.x or earlier**, where the framework came from CocoaPods: run `pod install` (or `npx expo prebuild --clean`). The `AmplySDK` pod leaves `Podfile.lock` on its own.

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

// Observe campaign deeplinks (campaign id, name and trigger in event.info)
const unsubscribe = await Amply.addDeepLinkListener((event) => {
  analytics.track('Amply link', { url: event.url, campaign: event.info.campaignId });
});
```

The deeplink listener is an observer, on both platforms. Amply opens the link itself, from a
DeepLink campaign and from a mini-app button alike, and your app receives it through `Linking`
like any other link. Route in one place, your `Linking` handler or router. Do not call
`Linking.openURL(event.url)` or navigate from the listener, or the link is handled twice.

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
