# `example/shared` — the sample app, once

Both React Native examples render **the same screens from this one module**. `bare/` and `expo/`
contribute only what genuinely differs between them:

| Stays in the host | Lives here |
|---|---|
| navigation (react-navigation vs. expo-router) | every screen and control |
| deeplink *registration* (Info.plist, AndroidManifest, `app.json` scheme) | deeplink *handling* |
| safe-area insets | the SDK bridge, the log, the gates, the launch contract |
| the target config (appId, keys, channel name, scheme) | everything else |

Why: the two examples were two copies of one hook (`bare/src/hooks/useAmplyDemo.ts` and
`expo/src/hooks/useAmplyDemo.ts`), and copy-paste has no compiler. The same fork in the KMP repo
let one `HomeViewController.swift` reach 886 lines while its twin sat at 566 — both building
clean the whole time.

What each control must do is **not** described here. The canonical spec is one document in the
KMP repo: `multiplatform-library-template/samples/SAMPLE_APP_SPEC.md`.

## Mounting it from a host

```tsx
import {AmplySampleProvider, HomeScreen, InspectScreen} from '@amply/sample-shared';

<AmplySampleProvider config={{appId, apiKeyPublic, apiKeySecret, channel: 'bare', scheme: 'amplybare'}}>
  {/* your navigator, rendering <HomeScreen onOpenInspect={…} /> and <InspectScreen /> */}
</AmplySampleProvider>
```

The host also has to react to `useSnapshotRequest()` — when a `?amplySnapshot=inspect.*` deeplink
arrives the host is the only thing that can push its own Inspect route, and it must do so with no
animation (SAMPLE_APP_SPEC.md §7).

## Metro

The module is resolved by an `extraNodeModules` alias in each host's `metro.config.js`, with
`example/` inside `watchFolders`. It is not published and has no build step; metro transpiles the
TypeScript sources directly.
