import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { routeAmplyUrl } from '../src/utils/amplyDeepLinkRouter';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // Handle deep links from system Linking API.
  // Note: Amply SDK deep links (amply://) are handled in useAmplyDemo via Amply.addDeepLinkListener.
  // This handles external URLs (http/https) that native code opens via system.
  useEffect(() => {
    // Filter out Expo development client URLs - these are internal to Expo
    const isExpoDevClientUrl = (url: string) => url.includes('expo-development-client');

    Linking.getInitialURL().then((url) => {
      if (url && !isExpoDevClientUrl(url)) routeAmplyUrl(url);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (!isExpoDevClientUrl(url)) routeAmplyUrl(url);
    });
    return () => subscription.remove();
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: '#2c6bed',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}>
      <Stack.Screen
        name="index"
        options={{ title: 'Amply SDK Demo' }}
      />
      <Stack.Screen
        name="promo/[id]"
        options={{ title: 'Campaign Promo' }}
      />
    </Stack>
  );
}
