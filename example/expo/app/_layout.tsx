import React, {useEffect} from 'react';
import {StatusBar} from 'react-native';
import {Stack} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import {Theme} from '@amply/sample-shared';

/**
 * The whole of the Expo example's host boundary.
 *
 * Four things, and no screen content: expo-router's navigator, the splash hand-off Expo
 * requires, the status-bar style, and the background the router paints between screens. The
 * URL scheme is the fifth, and it is declarative — `app.json` → `expo.scheme`, which
 * `expo prebuild` writes into `Info.plist` and `AndroidManifest.xml`.
 *
 * No `<SafeAreaProvider>` here on purpose: expo-router's own root already renders one
 * (`expo-router/build/ExpoRoot.js`), and `SampleTabs` consumes its insets. The bare example has
 * no router, so it provides its own — that is the entire difference between the two hosts.
 *
 * The status bar is set explicitly rather than left to expo-router's `AutoStatusBar`, which
 * follows the OS colour scheme. The sample's palette is fixed dark (a light/dark flip between
 * two runs is noise in exactly the comparison these samples exist for), so on a light-mode
 * device the automatic bar would draw dark glyphs on a black page.
 */
void SplashScreen.preventAutoHideAsync();

export default function RootLayout(): React.JSX.Element {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <>
      <StatusBar barStyle="light-content" />
      <Stack
        screenOptions={{
          contentStyle: {backgroundColor: Theme.page},
          headerStyle: {backgroundColor: Theme.card},
          headerTintColor: Theme.label,
        }}>
        {/* The sample owns the full screen: its own tab bar is the navigation. */}
        <Stack.Screen name="index" options={{headerShown: false}} />
        <Stack.Screen
          name="promo/[id]"
          // Without this the back button reads `index`, the route's filename.
          options={{title: 'Campaign deeplink', headerBackTitle: 'Sample'}}
        />
      </Stack>
    </>
  );
}
