// swift-tools-version: 6.0
//
// Swift Package Manager manifest for React Native's SPM mode (RN 0.87+, `npx react-native spm`).
// CocoaPods-mode apps use AmplyReactNative.podspec instead; both ship in the same npm package.
//
// React Native links this directory into every app as
// <app>/ios/build/generated/autolinking/libs/AmplyReactNative, and the two local package paths
// below are relative to that link — the same paths `npx react-native spm scaffold` emits. They do
// not depend on where node_modules puts this package.
//
// The AmplySDK version is pinned exactly and must equal package.json → amply.iosSdkVersion;
// release.sh writes both, and a Jest test fails when they drift.

import PackageDescription

let amplySdkVersion: Version = "0.17.2"

let package = Package(
    name: "AmplyReactNative",
    platforms: [.iOS("15.1")],
    products: [
        // Static, like the CocoaPods build: AmplySDK is a static framework, and a dynamic wrapper
        // would carry a second copy of it.
        .library(name: "AmplyReactNative", type: .static, targets: ["AmplyReactNative"]),
    ],
    dependencies: [
        .package(url: "https://github.com/amply-tools/amply-sdk-ios.git", exact: amplySdkVersion),
        .package(name: "ReactNative", path: "../../../../xcframeworks"),
        .package(name: "React-GeneratedCode", path: "../../../ios"),
    ],
    targets: [
        .target(
            name: "AmplyReactNative",
            dependencies: [
                .product(name: "AmplySDK", package: "amply-sdk-ios"),
                .product(name: "ReactHeaders", package: "ReactNative"),
                .product(name: "ReactNativeHeaders", package: "ReactNative"),
                .product(name: "ReactNativeDependenciesHeaders", package: "ReactNative"),
                .product(name: "ReactAppHeaders", package: "React-GeneratedCode"),
            ],
            path: "Sources/AmplyReactNative",
            sources: [
                "AmplyModule.mm",
                "AmplyReactNative/AmplyReactNative-generated.mm",
            ],
            publicHeadersPath: "AmplyReactNative",
            cxxSettings: [
                .headerSearchPath("."),
                // The prebuilt React.framework is built with these; Fabric/TurboModule C++ must match.
                .define("DEBUG", .when(configuration: .debug)),
                .define("NDEBUG", .when(configuration: .release)),
            ],
            linkerSettings: [.linkedFramework("UIKit"), .linkedFramework("Foundation")]
        ),
    ],
    cxxLanguageStandard: .cxx20
)
