# iOS Placeholder

The Amply React Native Swift bridge will land once the Amply KMP XCFramework is published.

Planned steps:

1. Publish `AmplySDK.xcframework` + Swift Package.
2. Replace placeholder Swift stubs with the generated TurboModule implementation.
3. Wire CocoaPods + SPM manifests to consume the binary target.

Until then, the module intentionally rejects calls on iOS builds.
