Pod::Spec.new do |s|
  s.name         = 'AmplyReactNative'
  s.version      = '0.1.0'
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

  # Amply KMP SDK from CocoaPods
  s.dependency 'AmplySDK', '~> 0.10.1'

  s.libraries = 'c++'
  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES' => 'YES',
    'DEFINES_MODULE' => 'YES',
  }

  # Enable modules for importing the AmplySDK framework
  s.user_target_xcconfig = {
    'CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES' => 'YES',
  }
end
