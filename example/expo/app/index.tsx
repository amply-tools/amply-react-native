import React from 'react';
import {AmplySampleProvider, SampleTabs} from '@amply/sample-shared';

import {SAMPLE_CONFIG} from '../src/sampleConfig';

/**
 * The Expo example's one screen — and it renders nothing of its own.
 *
 * Everything a person sees (the five tabs, every control, the launch contract) comes from
 * `example/shared`, which `example/bare` mounts exactly the same way. What stays with the host
 * lives in `app/_layout.tsx`: expo-router, the safe-area provider expo-router already supplies,
 * the status-bar style, and the URL scheme `expo prebuild` registers from `app.json`.
 *
 * This file used to build its own `ScrollView` out of `src/hooks/useAmplyDemo.ts`, a copy of the
 * bare example's hook. Copy-paste has no compiler: the two drifted, both compiled clean, and
 * nothing noticed. `scripts/check-sample-parity.sh` now asserts that this file imports the
 * shared module, because the module being on metro's search path is not the same claim as this
 * host rendering it.
 */
export default function Index(): React.JSX.Element {
  return (
    <AmplySampleProvider config={SAMPLE_CONFIG}>
      <SampleTabs />
    </AmplySampleProvider>
  );
}
