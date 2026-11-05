require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))
# The native iOS SDK this bridge was built and tested against. release.sh writes it; keep it exact.
amply_ios_sdk_version = package.dig('amply', 'iosSdkVersion') or
  raise('package.json is missing amply.iosSdkVersion')

Pod::Spec.new do |s|
  s.name         = 'AmplyReactNative'
  s.version      = package['version']
  s.summary      = 'React Native bridge for Amply SDK'
  s.homepage     = 'https://github.com/amply-tools/amply-react-native'
  s.license      = { :type => 'MIT' }
  s.authors      = { 'Amply' => 'opensource@amply.tools' }
  s.source       = { :git => 'https://github.com/amply-tools/amply-react-native.git', :tag => s.version.to_s }

  s.platforms    = { :ios => '15.1' }

  # NOTE: This podspec MUST live at the package root (alongside package.json)
  # so that RN CLI / expo-modules-autolinking auto-discovery finds it.
  # Their iosResolver only scans the package root (non-recursively) for
  # *.podspec files and ignores `react-native.config.js#ios.podspecPath`.
  # Source files stay under ios/Sources/ — we just reference them from here.
  s.source_files = 'ios/Sources/**/*.{swift,h,m,mm}'

  # React Native dependencies for TurboModules
  s.dependency 'React-Core'
  s.dependency 'ReactCommon/turbomodule/core'
  s.dependency 'React-RCTFabric'

  # Amply KMP SDK — from its Swift package, not from CocoaPods trunk (read-only from 2026-12-02).
  # spm_dependency ships with React Native 0.75+ (scripts/cocoapods/spm.rb) and wires the
  # package into the Pods project at `pod install`.
  if respond_to?(:spm_dependency, true)
    spm_dependency(s,
      url: 'https://github.com/amply-tools/amply-sdk-ios.git',
      requirement: { kind: 'exactVersion', version: amply_ios_sdk_version },
      products: ['AmplySDK']
    )
  else
    # Outside a React Native Podfile (`pod ipc spec`, `pod spec lint`) the helper is not loaded;
    # metadata evaluation must still work. Inside an app this means RN older than 0.75, which the
    # package does not support (peer react-native >= 0.79) — say so instead of failing at link.
    Pod::UI.warn('AmplyReactNative: spm_dependency is unavailable (React Native 0.75+ is required); AmplySDK will not be linked.') if defined?(Pod::UI)
  end

  # `xcodebuild archive` (EAS, Xcode Organizer) fails on a second copy of AmplySDK's xcframework
  # signature that Xcode writes into this pod's build directory. Details in the script.
  s.script_phase = {
    :name => '[Amply] Remove duplicate AmplySDK archive signature',
    :script => '/bin/sh "${PODS_TARGET_SRCROOT}/ios/scripts/remove-duplicate-archive-signature.sh"',
    :execution_position => :after_compile,
    :always_out_of_date => '1',
  }

  s.libraries = 'c++'
  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES' => 'YES',
    'DEFINES_MODULE' => 'YES',
    # Lets AmplyModule.mm refuse a dynamic-framework build at compile time. The value is the
    # target's final Mach-O type, after Expo and CocoaPods have settled the linkage.
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) AMPLY_RN_MACH_O_$(MACH_O_TYPE)=1',
  }

  # Enable modules for importing the AmplySDK framework
  # The Swift package's product is linked into this pod's target, and with static linkage (Expo's
  # default, and use_frameworks! :linkage => :static) that link does not reach the app binary.
  # Xcode places the framework in the shared build products directory, so the app links it
  # from there itself.
  s.user_target_xcconfig = {
    'CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES' => 'YES',
    'FRAMEWORK_SEARCH_PATHS' => '$(inherited) "${PODS_CONFIGURATION_BUILD_DIR}"',
    'OTHER_LDFLAGS' => '$(inherited) -framework "AmplySDK"',
  }
end
