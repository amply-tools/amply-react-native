import {Platform} from 'react-native';
import type {SampleTargetConfig} from '@amply/sample-shared';

/**
 * Supply your own Amply API keys. Replace these placeholders (or wire them to your own untracked
 * config/env) before running the example — real credentials must never be committed.
 *
 * The pair is PER PLATFORM. In Amply one application is one platform, so a React Native app that
 * ships on both stores is two applications with two key pairs, even when the bundle id is the
 * same. Initialising an iOS build with the Android pair reports its events against the wrong
 * application, and the wrong application's campaigns come back — which looks like "no campaign
 * matched" rather than like a misconfiguration.
 */
const KEYS = Platform.select({
  ios: {
    apiKeyPublic: 'YOUR_IOS_API_KEY_PUBLIC',
    apiKeySecret: 'YOUR_IOS_API_KEY_SECRET',
  },
  default: {
    apiKeyPublic: 'YOUR_ANDROID_API_KEY_PUBLIC',
    apiKeySecret: 'YOUR_ANDROID_API_KEY_SECRET',
  },
});

export const SAMPLE_CONFIG: SampleTargetConfig = {
  appId: 'tools.amply.sample',
  apiKeyPublic: KEYS.apiKeyPublic,
  apiKeySecret: KEYS.apiKeySecret,
  /**
   * On screen as a pill, because a screenshot of the wrong sample is otherwise
   * indistinguishable from the right one — and `bare` and `expo` exist precisely to be compared.
   */
  channel: 'bare',
  /** Registered in `ios/AmplyBareExample/Info.plist` and `android/app/src/main/AndroidManifest.xml`. */
  scheme: 'amplybare',
};
