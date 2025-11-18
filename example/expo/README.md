# Amply React Native SDK - Expo Example

This is an Expo example app demonstrating integration with the Amply React Native SDK.

## Quick Start

### Prerequisites
- Node.js and npm/yarn installed
- Android Studio/emulator or a physical Android device connected via ADB
- JDK 17+ installed

### Setup

```bash
# 1. Install dependencies
yarn install

# 2. Generate native code (runs automatically with Expo's autolinking)
expo prebuild --clean   # (~2-3 minutes, one-time only)

# 3. Run the app
expo start              # Terminal 1 - Start dev server
expo run:android        # Terminal 2 - Build and run
```

The Amply SDK is automatically configured via React Native's autolinking mechanism (react-native.config.js). No manual setup needed!

## Development Workflow

### Normal development (after first setup)
```bash
expo start              # Terminal 1
expo run:android        # Terminal 2
```

### Reset and rebuild from scratch
```bash
rm -rf android ios
expo prebuild --clean
expo start
```

The Amply SDK is automatically linked via React Native's autolinking mechanism.

### Metro bundler debugging
If you encounter Metro bundler issues:
```bash
watchman watch-del-all
watchman watch-project .
```

## Project Structure

- **app/** - React Navigation routes and screens
- **android/** - Generated native Android code (created by `expo prebuild`)
- **babel.config.js** - Babel configuration for Expo
- **metro.config.js** - Metro bundler configuration with monorepo support
- **expo.config.js** - Expo configuration including the Amply plugin

## Testing Deeplinks

The example includes deeplink support configured in `expo.config.js` with scheme `amply://`.

Test deeplinks using adb:
```bash
adb shell am start -a android.intent.action.VIEW -d "amply://campaign?id=test123"
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Module not found" after install | Run `yarn install` again in this directory |
| "Plugin not found" during prebuild | Ensure plugin is in `expo.config.js`: `"@amply/amply-react-native"` |
| Build fails with Gradle error | Usually Android SDK/JDK issue - verify: `adb devices` and `java -version` |
| Metro bundler 404 errors | Clear watchman: `watchman watch-del-all && watchman watch-project .` |
| Deeplinks not triggering | Verify module initialized: `adb logcat \| grep -i "amply"` should show logs |
| "TurboModule 'Amply' not found" | Verify Expo prebuild completed successfully: `rm -rf android ios && expo prebuild --clean && expo run:android` |

## Learn More

- [Amply SDK Documentation](https://github.com/amply/amply-react-native)
- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
