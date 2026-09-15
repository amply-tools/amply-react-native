This is the bare React Native example for `@amplytools/react-native-amply-sdk` (React Native 0.81).

**It is the release gate.** `release.sh` builds this app on both platforms before any RN publish —
Android against `tools.amply:sdk-android` from Maven, iOS against the `AmplySDK` pod — so it is the
only sample in the family whose native halves compile against *published* artifacts on both
platforms, and it must never be broken.

- The JS is linked locally (`link:../..`) under the **published package name**, the same string an
  integrator writes. It used to be linked under a legacy `@amply/amply-react-native` alias, which
  meant the release gate exercised an import nobody outside this repo could have.
- Every screen comes from `../shared`; this host contributes the target config, the safe-area
  provider, the status bar, and the URL schemes in `ios/AmplyBareExample/Info.plist` and
  `android/app/src/main/AndroidManifest.xml`.
- **Give it keys in the app**: SDK tab → `Set API keys`. They are stored on the device, outrank
  `src/sampleConfig.ts`, and survive a relaunch, so setup is a task inside the app measured in
  seconds rather than an edit-and-reload. `Clear stored keys` is the way back to the file.
- The committed keys are placeholders, and the SDK falls back to its **production** endpoints, so
  the sample **refuses to initialise** until it has a real pair — starting anyway posted sessions
  production rejected, ~543 a day. Editing `src/sampleConfig.ts` still works and is what CI uses;
  it is simply no longer the only door. See `SAMPLE_APP_SPEC.md` §5.5.

What each control means is specified once, in the KMP repo:
`multiplatform-library-template/samples/SAMPLE_APP_SPEC.md`. Do not restate it here.

## Linking the local SDK

```sh
cd example/bare
yarn install     # installs @amplytools/react-native-amply-sdk from `link:../..`
```

`metro.config.js` pins `react`, `react-native` and the other singletons to this app's copies. The
SDK repo root has its own `node_modules/react-native` (a devDependency of the library), and metro
resolves a module by walking up from the importing FILE — so without that pin, anything under
`../shared` loaded a *second* React Native and the app died on its first `<Text>` with "View config
getter callback for component `RCTText` must be a function". `extraNodeModules` cannot fix it: that
map is consulted only when resolution FAILS, and there it succeeds, on the wrong copy.

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Linking the local SDK

From the repository root, run:

```sh
cd example/bare
npm install
```

This installs the local `@amply/amply-react-native` package via the `file:../..` dependency declared in `package.json`. Re-run this command whenever you change the library build output with `yarn build` in the repository root.

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `src/App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
