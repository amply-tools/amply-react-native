#!/usr/bin/env bash
#
# Every method on the TS `Spec` interface must also exist in the three hand-written native
# specs, or JS calls it and nothing happens.
#
# This repo has no codegenConfig: the TurboModule specs are written by hand and committed.
# Android fails loudly when they drift — the Kotlin module stops overriding an abstract method
# and the build breaks. iOS does not fail at all. The .mm implementation compiles fine on its
# own; the method simply never reaches the JSI method map, so the JS call is a silent no-op.
#
# That is how `unregisterGate` shipped half-wired in the first pass of the gate-lifecycle work:
# TS spec, Android spec, both implementations, a clean clang syntax check — and an iOS binding
# that did not exist. Caught in review, not by any check. This is that check.
#
# Usage: bash scripts/check-spec-parity.sh
set -uo pipefail

cd "$(dirname "$0")/.."

TS_SPEC="src/nativeSpecs/NativeAmplyModule.ts"
ANDROID_SPEC="android/src/newarch/java/tools/amply/sdk/reactnative/NativeAmplyModuleSpec.java"
ANDROID_JNI="android/src/newarch/jni/AmplyReactNative-generated.cpp"
IOS_HEADER="ios/Sources/AmplyReactNative/AmplyReactNative/AmplyReactNative.h"
IOS_GENERATED="ios/Sources/AmplyReactNative/AmplyReactNative/AmplyReactNative-generated.mm"

for f in "$TS_SPEC" "$ANDROID_SPEC" "$ANDROID_JNI" "$IOS_HEADER" "$IOS_GENERATED"; do
  if [ ! -f "$f" ]; then
    echo "check-spec-parity: FAIL — missing $f" >&2
    exit 1
  fi
done

# Method names from the TS `Spec` interface body: lines like `  name(args): Ret;` at one level
# of indentation, excluding comments and the interface line itself.
methods=$(
  awk '/^export interface Spec extends TurboModule \{/{inside=1; next}
       inside && /^\}/{inside=0}
       inside' "$TS_SPEC" |
  grep -oE '^  [a-zA-Z][a-zA-Z0-9_]*\(' |
  tr -d ' (' |
  sort -u
)

if [ -z "$methods" ]; then
  echo "check-spec-parity: FAIL — parsed zero methods from $TS_SPEC; the parser is broken" >&2
  exit 1
fi

fail=0
for m in $methods; do
  # addListener/removeListeners are the RN event-emitter contract, supplied by the base class
  # on iOS rather than declared per-module.
  case "$m" in
    addListener|removeListeners) continue ;;
  esac

  grep -q "abstract .*[ *]$m(" "$ANDROID_SPEC" || {
    echo "check-spec-parity: $m is in the TS spec but NOT abstract in $ANDROID_SPEC" >&2
    fail=1
  }
  grep -qE "^- \(.*\)$m[:;]" "$IOS_HEADER" || {
    echo "check-spec-parity: $m is in the TS spec but NOT declared in $IOS_HEADER" >&2
    fail=1
  }
  # The method maps are what actually decide whether JS can reach it. BOTH platforms have one,
  # and both are hand-maintained here — Android's Java abstract spec is not enough on its own.
  for map in "$IOS_GENERATED" "$ANDROID_JNI"; do
    grep -q "methodMap_\[\"$m\"\]" "$map" || {
      echo "check-spec-parity: $m is in the TS spec but NOT in the JSI methodMap_ in $map" >&2
      echo "                   → JS would call it and nothing would happen, silently." >&2
      fail=1
    }
  done
done

if [ "$fail" -ne 0 ]; then
  echo "check-spec-parity: FAIL" >&2
  exit 1
fi

count=$(echo "$methods" | wc -w | tr -d ' ')
echo "check-spec-parity: OK — all $count TS spec methods are wired on both platforms."
