Pod::Spec.new do |s|
  s.name = 'FlyRightAssistant'
  s.version = '0.1.0'
  s.summary = 'Durable Siri action handoff to FlyRight.'
  s.description = 'Keeps navigation requests until the app and its active account are ready.'
  s.author = 'FlyRight'
  s.homepage = 'https://getflyright.com'
  s.license = { type: 'MIT' }
  s.platforms = { :ios => '16.4' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = '**/*.swift'
end
