#!/usr/bin/env bash
#
# Builds ios/Tests/AmplyBridgeValuesTests.mm against the real AmplySDK framework and runs it on an
# iOS simulator. The bridge has no Xcode test target; this is how its pure helpers are tested.
#
#   bash ios/Tests/run.sh
#
# AmplySDK: AMPLY_SDK_XCFRAMEWORK=<path to AmplySDK.xcframework>, or else the copy SwiftPM cached
# for package.json → amply.iosSdkVersion (any `pod install` / Xcode resolve of the example puts it
# there).
#
# Simulator: AMPLY_TEST_SIMULATOR_UDID=<a booted simulator> to reuse one; otherwise the script
# creates its own, and shuts it down and deletes it on exit. It never touches another simulator —
# other sessions may be using the booted ones.
set -euo pipefail
cd "$(dirname "$0")/../.."

version=$(node -p "require('./package.json').amply.iosSdkVersion")
work=$(mktemp -d "${TMPDIR:-/tmp}/amply-bridge-tests.XXXXXX")

xcframework="${AMPLY_SDK_XCFRAMEWORK:-}"
if [[ -z "$xcframework" ]]; then
  cached="$HOME/Library/Caches/org.swift.swiftpm/artifacts/https___github_com_amply_tools_amply_sdk_ios_releases_download_${version//./_}_AmplySDK_xcframework_zip"
  if [[ ! -f "$cached" ]]; then
    echo "AmplySDK $version is not in the SwiftPM cache ($cached)." >&2
    echo "Set AMPLY_SDK_XCFRAMEWORK to an AmplySDK.xcframework, or resolve the example's packages once." >&2
    exit 2
  fi
  unzip -q "$cached" -d "$work/sdk"
  xcframework="$work/sdk/AmplySDK.xcframework"
fi
slice="$xcframework/ios-arm64_x86_64-simulator"
[[ -d "$slice/AmplySDK.framework" ]] || { echo "No simulator slice in $xcframework" >&2; exit 2; }

binary="$work/AmplyBridgeValuesTests"
xcrun --sdk iphonesimulator clang++ \
  -target arm64-apple-ios15.1-simulator \
  -x objective-c++ -std=gnu++20 -fobjc-arc -fobjc-arc-exceptions -Wall -Werror \
  -I ios/Sources/AmplyReactNative -F "$slice" \
  ios/Sources/AmplyReactNative/AmplyBridgeValues.mm ios/Tests/AmplyBridgeValuesTests.mm \
  -framework AmplySDK -framework Foundation -framework UIKit -framework Network -framework Security \
  -framework SystemConfiguration -framework CoreTelephony -framework StoreKit -framework AdSupport \
  -framework AppTrackingTransparency -lsqlite3 \
  -o "$binary"

udid="${AMPLY_TEST_SIMULATOR_UDID:-}"
created=""
cleanup() {
  if [[ -n "$created" ]]; then
    xcrun simctl shutdown "$created" >/dev/null 2>&1 || true
    xcrun simctl delete "$created" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -z "$udid" ]]; then
  # The newest iOS runtime, and an iPhone that runtime supports.
  read -r runtime device_type < <(xcrun simctl list runtimes available -j | node -e '
    const runtimes = JSON.parse(require("fs").readFileSync(0, "utf8")).runtimes
      .filter((r) => r.platform === "iOS" && r.isAvailable);
    const latest = runtimes.sort((a, b) => a.version.localeCompare(b.version, undefined, {numeric: true})).pop();
    const iphones = (latest?.supportedDeviceTypes ?? []).filter((t) => t.productFamily === "iPhone");
    if (!latest || iphones.length === 0) process.exit(1);
    process.stdout.write(`${latest.identifier} ${iphones[iphones.length - 1].identifier}\n`);')
  created=$(xcrun simctl create "amply-bridge-tests-$$" "$device_type" "$runtime")
  udid="$created"
  xcrun simctl boot "$udid"
  xcrun simctl bootstatus "$udid" >/dev/null
fi

xcrun simctl spawn "$udid" "$binary"
