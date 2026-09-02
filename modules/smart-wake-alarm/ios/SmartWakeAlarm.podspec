require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'SmartWakeAlarm'
  s.version        = package['version']
  s.summary        = "Somno's native alarm module (iOS side: local-notification scheduling + looping background alarm audio)."
  s.author         = ''
  s.homepage       = 'https://github.com'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
end
