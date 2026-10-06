Pod::Spec.new do |s|
  s.name           = 'FlyRightHaptics'
  s.version        = '1.0.0'
  s.summary        = 'Custom Core Haptics patterns for the travel day.'
  s.description    = 'Local Expo module for FlyRight. Plays authored Core Haptics patterns for the travel day moments (boarding, take-off, landing, compensation owed) that the preset feedback generators cannot express.'
  s.author         = 'FlyRight'
  s.homepage       = 'https://getflyright.com'
  s.license        = { type: 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreHaptics'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
