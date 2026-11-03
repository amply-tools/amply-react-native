import React from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import {SafeAreaInsetsContext, SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {AmplySampleProvider, SampleTabs} from '@amply/sample-shared';

import {AmplitudeDemo} from './AmplitudeDemo';
import {SAMPLE_CONFIG} from './sampleConfig';

/**
 * The bare example contributes four things and no screens: the target config, the safe-area
 * provider, the status-bar style, and the URL schemes registered natively in `Info.plist` and
 * `AndroidManifest.xml`.
 *
 * Everything a person sees — the five tabs, every control, the launch contract — lives in
 * `example/shared`, which the Expo example mounts exactly the same way. The two examples were
 * two copies of one hook before this; copy-paste has no compiler.
 *
 * The Amplitude strip above the tabs is the one thing only this example has: `example/shared`
 * is also mounted by Expo, which does not carry `@amplitude/analytics-react-native`.
 */
function Screen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <AmplitudeDemo />
      {/* The strip already cleared the status bar; the tabs must not clear it a second time. */}
      <SafeAreaInsetsContext.Provider value={{...insets, top: 0}}>
        <SampleTabs />
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <AmplySampleProvider config={SAMPLE_CONFIG}>
        <Screen />
      </AmplySampleProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({root: {flex: 1}});
