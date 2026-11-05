#!/bin/sh
# Lets `xcodebuild archive` finish for apps that take AmplySDK through spm_dependency.
#
# Xcode builds AmplySDK's binary target into the shared build products directory and again
# into this pod's own CONFIGURATION_BUILD_DIR, writing AmplySDK.xcframework-<platform>.signature
# into both. An archive copies every signature into one Signatures folder and fails on the
# second: "AmplySDK.xcframework-ios.signature couldn't be copied to Signatures because an item
# with the same name already exists". Ordinary builds never hit it.
#
# Removes only the pod's copy, only while archiving, and only when the shared copy is
# byte-identical, so the archive keeps exactly one signature and a mismatch is never hidden.
# React Native 0.89 does the same in spm_dependency itself (an "[RN] Remove duplicate Swift
# package xcframework signatures" phase); there both run and whichever is second finds nothing.
# Like that phase, this relies on Xcode collecting signatures before the pod's sources finish
# compiling — the collection only needs the downloaded xcframework, so it runs first. An
# explicit input dependency would name a platform-specific file and fail ordinary builds where
# it is absent.
#
# Never fails the build: a cleanup that cannot run leaves a warning, and the archive step
# reports the duplicate itself.
set -u

[ "${ACTION:-}" = "install" ] || exit 0

if ! pod_dir=$(cd "${CONFIGURATION_BUILD_DIR:-}" 2>/dev/null && pwd -P) ||
   ! shared_dir=$(cd "${PODS_CONFIGURATION_BUILD_DIR:-}" 2>/dev/null && pwd -P); then
  echo "warning: AmplyReactNative: build directories not readable; duplicate AmplySDK signature left in place"
  exit 0
fi
[ "$pod_dir" != "$shared_dir" ] || exit 0

for signature in "$pod_dir"/AmplySDK.xcframework-*.signature; do
  [ -f "$signature" ] || continue
  shared_signature="$shared_dir/$(basename "$signature")"
  if [ -f "$shared_signature" ] && cmp -s "$signature" "$shared_signature"; then
    rm -f "$signature"
  fi
done
