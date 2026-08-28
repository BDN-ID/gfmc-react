import { TurboModuleRegistry, type TurboModule } from 'react-native';

/**
 * Spec TurboModule untuk gfmc-sdk. Method di sini adalah cermin 1:1 dari native API
 * `GfmcSDK` (lihat android/src/main/java/com/bdnid/gfmcreact/GfmcReactModule.kt).
 *
 * `env` dikirim sebagai string ('PRODUCTION' | 'SANDBOX' | 'DEV') karena codegen TurboModule
 * belum mendukung union literal string sebagai tipe enum native secara langsung untuk semua
 * platform; pemetaan ke enum `GfmcSDKEnv` dilakukan di sisi native Kotlin.
 */
export interface Spec extends TurboModule {
  // NOTE: nama method native SENGAJA bukan `init` — selector Objective-C apa pun yang segmen
  // pertamanya "init" (mis. `init:enableLogging:resolve:reject:`) otomatis masuk "init family"
  // ARC (lihat Clang Method Families), yang mengharuskan return type instancetype-compatible.
  // Return type method ini `void`/Promise, jadi kalau dinamai `init` build iOS akan gagal/UB.
  // API publik JS (`GfmcReact.init()` / `useGfmcSdk().init()`) tetap bernama `init` seperti
  // biasa — cuma method TurboModule mentah ini yang di-rename jadi `configure`.
  configure(env?: string, enableLogging?: boolean): Promise<void>;
  open(jwt: string): Promise<void>;
  getVersion(): Promise<string>;

  // Dipanggil dari JS untuk menjawab event `onTokenRefreshRequested` dengan JWT baru.
  submitTokenRefresh(requestId: string, jwt: string): void;

  // Dipanggil dari JS saat refresher gagal mendapatkan JWT baru, supaya request native yang
  // sedang menggantung (menunggu `GfmcRefreshResult`) tidak hang selamanya.
  failTokenRefresh(requestId: string, message: string): void;

  // Method standar yang dibutuhkan NativeEventEmitter pada arsitektur baru (new architecture).
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('GfmcReact');
