Pod::Spec.new do |s|
  s.name           = 'FlyRightLiveActivities'
  s.version        = '1.0.0'
  s.summary        = 'Lists and ends the Live Activities the OS still shows for FlyRight.'
  s.description    = 'Local Expo module for FlyRight. Lets the travel-day lifecycle see every Live Activity ActivityKit still holds for the app and end the ones it no longer remembers.'
  s.author         = 'FlyRight'
  s.homepage       = 'https://getflyright.com'
  s.license        = { type: 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # The activities are typed with OneSignal's default attributes (the widget
  # renders DefaultLiveActivityAttributes), so the same module is needed to
  # enumerate them.
  s.dependency 'OneSignalXCFramework/OneSignalLiveActivities'
  s.frameworks = 'ActivityKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
