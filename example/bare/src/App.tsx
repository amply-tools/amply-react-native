import React from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {AmplySampleProvider, SampleTabs} from '@amply/sample-shared';

import {SAMPLE_CONFIG} from './sampleConfig';

/**
 * The bare example contributes four things and no screens: the target config, the safe-area
 * provider, the status-bar style, and the URL schemes registered natively in `Info.plist` and
 * `AndroidManifest.xml`.
 *
 * Everything a person sees — the five tabs, every control, the launch contract — lives in
 * `example/shared`, which the Expo example mounts exactly the same way. The two examples were
 * two copies of one hook before this; copy-paste has no compiler.
 */
export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <AmplySampleProvider config={SAMPLE_CONFIG}>
        <SampleTabs />
      </AmplySampleProvider>
    </SafeAreaProvider>
  );
}
