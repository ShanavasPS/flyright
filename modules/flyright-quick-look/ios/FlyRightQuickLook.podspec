Pod::Spec.new do |s|
  s.name           = 'FlyRightQuickLook'
  s.version        = '1.0.0'
  s.summary        = 'Shows a kept booking document in Quick Look.'
  s.description    = 'Local Expo module for FlyRight. Presents a local file in QLPreviewController, the system document viewer, so a traveller can read their booking without leaving the app.'
  s.author         = 'FlyRight'
  s.homepage       = 'https://getflyright.com'
  s.license        = { type: 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'QuickLook'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
