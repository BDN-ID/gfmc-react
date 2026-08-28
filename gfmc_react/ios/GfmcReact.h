#import <GfmcReactSpec/GfmcReactSpec.h>
#import <React/RCTEventEmitter.h>

// Superclass RCTEventEmitter (bukan NSObject polos) karena module ini emit banyak
// event ke JS (onHubReady, onError, dst) — RCTEventEmitter sudah mengimplementasikan
// addListener:/removeListeners: yang dibutuhkan protokol NativeGfmcReactSpec, dan
// menyediakan sendEventWithName:body: yang aman dipanggil dari thread mana pun.
//
// Implementasi sesungguhnya (bicara ke JessicaSDK) ada di GfmcReactImpl.swift —
// class ini (lewat GfmcReact.mm) hanya meneruskan tiap method spec ke sana, karena
// method getTurboModule: butuh tipe C++ (facebook::react::...) yang tidak bisa
// diekspresikan langsung dari Swift.
@interface GfmcReact : RCTEventEmitter <NativeGfmcReactSpec>

@end
