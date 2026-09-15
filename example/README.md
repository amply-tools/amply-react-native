# Amply React Native examples

Two example apps live here. **What they must contain is not described in this file** — the
canonical specification for every Amply sample app, on every platform, is one document in the KMP
repo:

> **`multiplatform-library-template/samples/SAMPLE_APP_SPEC.md`**

There is deliberately only one copy of it. Six samples in two repositories previously drifted
apart because each carried its own description of the same screen; forking the spec text into this
repo would recreate exactly that.

## One implementation, two hosts

Both examples render **the same screens from `shared/`**. A host contributes only what genuinely
differs between them — the target config, the safe-area provider, the status-bar style, and the
URL schemes registered natively. Everything a person sees, including the launch contract, lives in
the shared module. See `shared/README.md`.

That is not tidiness: `bare/src/hooks/useAmplyDemo.ts` and `expo/src/hooks/useAmplyDemo.ts` were
two copies of one hook, and copy-paste has no compiler. The parity checker now also asserts that
each host **mounts** the shared module, because a control id sitting in `shared/` satisfies the
grep for both examples whether or not either one renders it.

## The two examples

| Example | What it links | What it guards |
|---|---|---|
| `bare/` | JS linked locally; **both native halves resolved from the published artifacts** — Android via `tools.amply:sdk-android`, iOS via the `AmplySDK` pod | The release gate. `release.sh` builds this app on both platforms before any RN publish. It is the only sample in the family that compiles against published native artifacts on both platforms, and it must never be broken. |
| `expo/` | The published npm package name, under Expo prebuild | That an integrator following the Expo path gets a working app — autolinking without a config-plugin entry (the SDK's plugin is a deliberate no-op since 0.2.12), and the `fmt` C++17 workaround re-applied to a Podfile `prebuild` regenerates. |

## Parity check

```bash
yarn check:sample-parity          # or: bash scripts/check-sample-parity.sh
```

It reads `example/sample-manifest.txt` — the required control inventory — and greps each example's
sources for every control id required on the `rn` column, failing with the list of what is missing,
per example.

Before it checks a single id it asserts that each host **mounts** `shared/` — `bare/src/App.tsx`
and `expo/app/index.tsx` must import `@amply/sample-shared`. Without that assertion the check is
worthless for this repo: the module is on both examples' metro search paths, so every id in it
satisfies the grep for a host that never renders it. `expo` reported "all 40 required controls
present" for exactly one day while `app/index.tsx` was still building its own `ScrollView`.
Do not weaken the checker to make it pass.

`example/sample-manifest.txt` is a **verbatim copy** of
`multiplatform-library-template/samples/sample-manifest.txt`. This repo is published to npm and
mirrored publicly, so it cannot depend on a sibling checkout existing — but a duplicate nothing
checks is drift with extra steps, so the checker diffs the two whenever the KMP repo is reachable
(sibling directory, or `AMPLY_SAMPLE_MANIFEST_PEER=<path>`) and **fails on any difference**. When
it is not reachable it says so and prints the revision it used, rather than passing quietly. Bump
`# revision:` on any change and land both copies in the same wave.

It runs as part of `yarn test`, which it joined when the last RN example (`expo`) was rebuilt to
spec — until then a permanently-red `yarn test` would have drowned the signal it exists to give.

## Running them

```bash
# bare
cd bare && yarn install
cd ios && pod install && cd ..
yarn ios          # or: yarn android
yarn test         # mounts the whole app against a stubbed bridge

# expo — yarn, not npm: the workspace links are yarn's `link:` protocol
cd expo && yarn install
npx expo prebuild --clean          # regenerates ios/ and android/, both gitignored
npx expo run:ios  # or: npx expo run:android
```

Do not touch the `fmt` C++17 pin in `bare/ios/Podfile` or `expo/plugins/withFmtCpp17.js` — it works
around an Xcode 26 `consteval` breakage in fmt 11 and its removal has to be a deliberate,
version-justified change.

## Deterministic screenshots

Both examples take the launch contract described in `SAMPLE_APP_SPEC.md` §7. On React Native the
transport is a deeplink rather than a launch argument, because neither example can read launch
arguments without a new native dependency:

Each example uses **its own registered scheme**, so an instruction is never ambiguous when both
are installed — `amplybare://` for `bare/`, `amplyexpo://` for `expo/`:

```bash
# bare — iOS simulator
xcrun simctl openurl booted "amplybare://snapshot?amplySnapshot=inspect.properties&amplySeed=1"

# expo — the path must be EMPTY: expo-router routes by path, and `//snapshot` would land on its
# not-found screen. `bare` has no router and no such constraint.
xcrun simctl openurl booted "amplyexpo:///?amplySnapshot=inspect.properties&amplySeed=1"

# Android — the & must survive BOTH shells, so quote the URL for the device's shell too
adb shell "am start -a android.intent.action.VIEW \
  -d 'amplybare://snapshot?amplySnapshot=inspect.properties&amplySeed=1'"
```

The app switches straight to the named tab, seeds deterministic state through real SDK calls, and
sets the `amply.snapshot.ready` marker once the screen is rendered and settled. Both parameters are
inert when absent.

Two things a harness driving this has to know, both measured rather than assumed:

- **The marker is a dedicated 1×1 node, not the root view.** React Native prunes a plain container
  from the iOS accessibility tree, so an identifier on the root is invisible to anything polling
  it. Every button and field does appear, under its manifest id.
- **iOS 26 may confirm a `simctl openurl` with an "Open in …?" alert.** It appeared on every
  launch of `bare` and on none of `expo`'s, on the same iOS 26.3 runtime — so a harness must
  handle it and must not depend on it. It is the system's alert, not the app's; dismiss it
  (`idb ui tap`) and the launch contract proceeds untouched. Android has no such prompt.
