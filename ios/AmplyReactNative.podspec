Pod::Spec.new do |s|
  s.name         = 'AmplyReactNative'
  s.version      = '0.1.0-alpha.0'
  s.summary      = 'React Native bridge for Amply SDK'
  s.homepage     = 'https://github.com/amply/amply-react-native'
  s.license      = { :type => 'MIT' }
  s.authors      = { 'Amply' => 'opensource@amply.tools' }
  s.source       = { :git => 'https://github.com/amply/amply-react-native.git', :tag => s.version.to_s }

  s.platforms    = { :ios => '15.1' }
  s.source_files = 'Sources/**/*.{swift,h,m,mm}'

  # React Native dependencies for TurboModules
  s.dependency 'React-Core'
  s.dependency 'ReactCommon/turbomodule/core'
  s.dependency 'React-RCTFabric'

  # Amply KMP SDK from CocoaPods
  s.dependency 'AmplySDK', '~> 0.1.7'

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
