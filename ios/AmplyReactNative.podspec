Pod::Spec.new do |s|
  s.name         = 'AmplyReactNative'
  s.version      = '0.1.0-alpha.0'
  s.summary      = 'React Native bridge for Amply (iOS placeholder)'
  s.homepage     = 'https://github.com/amply/amply-react-native'
  s.license      = { :type => 'MIT' }
  s.authors      = { 'Amply' => 'opensource@amply.tools' }
  s.source       = { :git => 'https://github.com/amply/amply-react-native.git', :tag => s.version.to_s }

  s.platforms    = { :ios => '13.0' }
  s.source_files = 'Sources/**/*.{swift,h}'
  s.dependency 'React-Core'

  s.prepare_command = <<-CMD
    echo 'Amply iOS binary not yet published. Swift implementation pending.'
  CMD
end
