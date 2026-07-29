#!/usr/bin/env bash
#
# Each host-callback seam must STORE the token the SDK hands back at registration, because that
# token is the only thing that can withdraw it.
#
# Why a grep and not a compiler check: changing a registration from returning Unit to returning
# ListenerToken does NOT change the Objective-C selector, and Kotlin lets a return value be
# discarded. So a bridge that calls the new API and throws the token away compiles cleanly, passes
# `clang -fsyntax-only`, and is silently unable to ever withdraw that seam. Nothing in either type
# system catches it. This does.
#
# Exits non-zero and names the seam if one is missing.
set -euo pipefail
cd "$(dirname "$0")/.."

IOS_BRIDGE="ios/Sources/AmplyReactNative/AmplyModule.mm"
ANDROID_BRIDGE="android/src/main/java/tools/amply/sdk/reactnative/core/DefaultAmplyClient.kt"

failed=0

require_token() {
  local file="$1" prop="$2" seam="$3"
  if ! grep -q "$prop" "$file"; then
    echo "FAIL: $file does not store a token for the $seam seam (expected '$prop')" >&2
    failed=1
  fi
}

require_withdrawal() {
  local file="$1" call="$2" seam="$3"
  if ! grep -q "$call" "$file"; then
    echo "FAIL: $file never withdraws the $seam seam (expected a call to '$call')" >&2
    failed=1
  fi
}

# --- iOS ---
require_token "$IOS_BRIDGE" "logListenerToken"          "log listener"
require_token "$IOS_BRIDGE" "systemEventsListenerToken" "system events"
require_token "$IOS_BRIDGE" "deepLinkListenerToken"     "deeplink"
require_token "$IOS_BRIDGE" "gateTokens"                "gates"
require_withdrawal "$IOS_BRIDGE" "clearListenerToken:"              "log listener"
require_withdrawal "$IOS_BRIDGE" "clearSystemEventsListenerToken:"  "system events"
require_withdrawal "$IOS_BRIDGE" "removeDeepLinkListenerToken:"     "deeplink"
require_withdrawal "$IOS_BRIDGE" "unregisterGateToken:"             "gates"

# The join. Withdrawal alone leaves a call already in flight writing into a destroyed JSI object,
# so -invalidate must take the same lock every emit holds.
require_withdrawal "$IOS_BRIDGE" "os_unfair_lock_lock" "emit barrier"

# --- Android ---
require_token "$ANDROID_BRIDGE" "logListenerToken"   "log listener"
require_token "$ANDROID_BRIDGE" "systemEventsToken"  "system events"
require_token "$ANDROID_BRIDGE" "deepLinkToken"      "deeplink"
require_token "$ANDROID_BRIDGE" "gateTokens"         "gates"
require_withdrawal "$ANDROID_BRIDGE" "Logger.clearListener"       "log listener"
require_withdrawal "$ANDROID_BRIDGE" "clearSystemEventsListener"  "system events"
require_withdrawal "$ANDROID_BRIDGE" "removeDeepLinkListener"     "deeplink"
require_withdrawal "$ANDROID_BRIDGE" "unregisterGate"             "gates"

if [ "$failed" -eq 0 ]; then
  echo "check-seam-tokens: OK — every seam stores a token and is withdrawn on both bridges."
fi
exit "$failed"
