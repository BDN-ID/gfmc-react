#import "GfmcReact.h"

// Header interop Swift->ObjC++ yang di-generate otomatis oleh Xcode dari GfmcReactImpl.swift
// (nama modul mengikuti `s.name` di podspec, yaitu "GfmcReact"). Dua bentuk import di bawah
// menutupi dua cara CocoaPods bisa mem-build modul ini (use_frameworks! vs static lib biasa).
#if __has_include("GfmcReact-Swift.h")
#import "GfmcReact-Swift.h"
#elif __has_include(<GfmcReact/GfmcReact-Swift.h>)
#import <GfmcReact/GfmcReact-Swift.h>
#else
#import "GfmcReact/GfmcReact-Swift.h"
#endif

/**
 * Class ini cuma "kabel" antara protokol TurboModule (codegen, Objective-C++) dan implementasi
 * sesungguhnya di GfmcReactImpl.swift, karena `getTurboModule:` butuh tipe C++
 * (`facebook::react::...`) yang tidak bisa dipanggil dari Swift.
 */
@implementation GfmcReact {
  GfmcReactImpl *_impl;
}

- (instancetype)init
{
  if (self = [super init]) {
    _impl = [[GfmcReactImpl alloc] initWithEmitter:self];
  }
  return self;
}

+ (BOOL)requiresMainQueueSetup
{
  // JessicaSDK (`Jessica`) adalah kelas `@MainActor` — setup di main queue supaya tidak ada
  // race saat instance pertama kali dibuat.
  return YES;
}

- (NSArray<NSString *> *)supportedEvents
{
  return [GfmcReactImpl allEvents];
}

#pragma mark - NativeGfmcReactSpec (diteruskan ke GfmcReactImpl.swift)

- (void)configure:(NSString *)env
    enableLogging:(NSNumber *)enableLogging
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject
{
  [_impl configure:env enableLogging:enableLogging resolve:resolve reject:reject];
}

- (void)open:(NSString *)jwt
     resolve:(RCTPromiseResolveBlock)resolve
      reject:(RCTPromiseRejectBlock)reject
{
  [_impl open:jwt resolve:resolve reject:reject];
}

- (void)getVersion:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [_impl getVersionWithResolve:resolve reject:reject];
}

- (void)submitTokenRefresh:(NSString *)requestId jwt:(NSString *)jwt
{
  [_impl submitTokenRefresh:requestId jwt:jwt];
}

- (void)failTokenRefresh:(NSString *)requestId message:(NSString *)message
{
  [_impl failTokenRefresh:requestId message:message];
}

// addListener:/removeListeners: sudah diimplementasikan oleh superclass RCTEventEmitter,
// tidak perlu override di sini.

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeGfmcReactSpecJSI>(params);
}

+ (NSString *)moduleName
{
  return @"GfmcReact";
}

@end
