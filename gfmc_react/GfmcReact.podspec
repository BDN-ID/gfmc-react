require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "GfmcReact"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  # JessicaSDK (native gfmc-sdk untuk iOS) minimum iOS 15 — lihat
  # https://github.com/BDN-ID/gfmc-ios/blob/main/Package.swift. Tidak pakai
  # `min_ios_version_supported` bawaan react-native karena itu masih di bawah 15.
  s.platforms    = { :ios => "15.0" }
  s.source       = { :git => "https://github.com/BDN-ID/gfmc_react.git", :tag => "#{s.version}" }
  s.swift_version = "5.9"

  s.source_files = "ios/**/*.{h,m,mm,swift,cpp}"
  s.private_header_files = "ios/**/*.h"

  # JessicaSDK.xcframework di-vendor langsung di dalam package ini (bukan lewat
  # SPM/CocoaPods repo terpisah), supaya consumer cukup `pod install` tanpa
  # tambahan setup apa pun — setara dengan android/build.gradle yang sudah
  # mendaftarkan maven repo gfmc-sdk secara built-in. Binary ini diambil dari
  # release resmi https://github.com/BDN-ID/gfmc-ios (checksum sudah dicocokkan
  # dengan yang tertera di Package.swift repo tsb).
  s.vendored_frameworks = "ios/Frameworks/JessicaSDK.xcframework"

  # Wajib supaya Xcode menghasilkan header interop otomatis (`GfmcReact-Swift.h`)
  # yang dipakai GfmcReact.mm untuk memanggil implementasi Swift dari
  # Objective-C++; Swift-nya sendiri cukup `import React` (pod React sudah
  # DEFINES_MODULE) tanpa perlu bridging header manual.
  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
  }

  install_modules_dependencies(s)
end
