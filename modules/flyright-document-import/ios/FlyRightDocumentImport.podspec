Pod::Spec.new do |s|
  s.name           = 'FlyRightDocumentImport'
  s.version        = '1.0.0'
  s.summary        = 'Reads shared travel documents: PDF text via PDFKit, barcodes via Vision.'
  s.description    = 'Local Expo module for FlyRight. Turns a shared PDF into per-page text and decoded barcodes so the app can import the flights it describes.'
  s.author         = 'FlyRight'
  s.homepage       = 'https://getflyright.com'
  s.license        = { type: 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'PDFKit', 'Vision'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
