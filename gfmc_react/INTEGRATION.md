# Panduan Integrasi `gfmc_react`

Dokumen ini untuk tim yang meng-*consume* package `gfmc_react` dari aplikasi React Native
mereka (misalnya project `gfmc-react-example` atau app produksi lainnya). Fokus dokumen ini
adalah integrasi Android — iOS belum didukung (file iOS di package ini masih placeholder
bawaan scaffold, tidak ada logic).

---

## 1. Prasyarat

- React Native dengan **New Architecture (TurboModules) aktif**. `gfmc_react` dibuat sebagai
  TurboModule, jadi app consumer wajib jalan di new-arch (`newArchEnabled=true`).
- Android `minSdkVersion` app >= 24 (mengikuti `minSdkVersion` yang dipakai `gfmc_react`).
- JDK 17 untuk build Android (mengikuti `compileOptions` di `gfmc_react/android/build.gradle`).
- Akses ke package `gfmc_react` itu sendiri — lewat registry npm privat, `npm link`, atau
  `yalc` (lihat bagian [6. Linking lokal](#6-linking-lokal-development)).

---

## 2. Instalasi package

```sh
npm install gfmc_react
# atau
yarn add gfmc_react
```

Setelah install, jalankan ulang `pod install` untuk iOS kalau app kamu juga build iOS (walau
`gfmc_react` di sisi iOS belum ada logic, kelengkapan autolinking tetap perlu ini). Untuk
Android tidak perlu langkah tambahan di luar yang dijelaskan di bagian 3.

---

## 3. Konfigurasi Android (WAJIB)

### 3.1 Daftarkan Maven repo `gfmc-sdk`

`gfmc_react` membungkus native SDK `com.sltr.gfmc:gfmc-sdk:1.2.9` yang di-host lewat GitHub
Pages, bukan Maven Central/Google. Repo Maven ini **sudah** dideklarasikan di
`gfmc_react/android/build.gradle`, tapi kalau app kamu pakai
`dependencyResolutionManagement` di `settings.gradle.kts` (default template React Native
terbaru, biasanya dengan mode `FAIL_ON_PROJECT_REPOS`), deklarasi repo di level module
library akan **diabaikan sepenuhnya**. Kamu **wajib** menambahkan repo ini secara eksplisit
di `settings.gradle.kts` milik app:

```kotlin
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // WAJIB untuk gfmc_react / gfmc-sdk
        maven { url = uri("https://raw.githubusercontent.com/BDN-ID/gfmc-sdk/gh-pages/") }
    }
}
```

Kalau app kamu masih pakai `build.gradle` (Groovy) versi lama tanpa
`dependencyResolutionManagement`, repo yang sudah dideklarasikan di module `gfmc_react`
biasanya cukup dan tidak perlu langkah tambahan ini.

**Gejala kalau langkah ini terlewat**: build Android gagal di tahap
`:gfmc_react:compileDebugKotlin` atau `resolveConfiguration` dengan pesan semacam
`Could not find com.sltr.gfmc:gfmc-sdk:1.2.9` meskipun koneksi internet normal.

### 3.2 Autolinking

Tidak perlu registrasi manual `MainApplication`/`getPackages()` — `GfmcReactPackage`
ter-autolink otomatis lewat React Native CLI/Gradle plugin standar, selama
`node_modules/gfmc_react` ada dan project sudah `pod install`/gradle sync ulang.

---

## 4. Inisialisasi SDK

**Catatan penting versi 1.2.9**: host `PRODUCTION` gfmc-sdk saat ini belum bisa diakses.
Selalu gunakan `GfmcEnv.SANDBOX` sampai ada pemberitahuan resmi dari BDN-ID bahwa
`PRODUCTION` sudah aktif kembali.

**Catatan `getVersion()`**: native `GfmcSDK` punya dua cara baca versi — `SDK_VERSION` (String
polos, mis. `"2.3.9"`) dan `version` (objek `GfmcSDKVersion` dengan field `major`/`minor`/
`patch`/`versionCode`/dst). Wrapper ini **selalu** memakai `SDK_VERSION` untuk `getVersion()`/
`useGfmcSdk().version`, karena Promise React Native tidak bisa membawa objek Kotlin custom —
kalau butuh field lain dari `GfmcSDKVersion`, itu perlu ditambahkan sebagai method native baru.

### Opsi A — React hook (`useGfmcSdk`, direkomendasikan untuk komponen React)

```tsx
import { useEffect } from 'react';
import { useGfmcSdk, GfmcEnv } from 'gfmc_react';

function App() {
  const {
    init,
    open,
    version,
    setTokenRefresher,
    setSkuListener,
    setHubReadyListener,
    setHubClosedListener,
    setModuleChangedListener,
    setPurchaseCompletedListener,
    setPurchaseFailedListener,
    lastError,
  } = useGfmcSdk();

  useEffect(() => {
    init(GfmcEnv.SANDBOX, __DEV__ /* enableLogging */).catch((err) => {
      console.error('Gagal init gfmc_react:', err);
    });

    // Native akan minta JWT baru lewat callback ini setiap kali token lama dianggap
    // kedaluwarsa oleh SDK. Kalau promise ini reject/throw, hook otomatis memanggil
    // `failTokenRefresh` ke native — kamu tidak perlu memanggilnya manual di sini.
    setTokenRefresher(async () => {
      const jwt = await fetchFreshJwtFromMyBackend();
      return jwt;
    });

    // Dipanggil setiap user memilih SKU/produk di dalam hub gfmc.
    setSkuListener((sku) => {
      console.log('User memilih SKU:', sku);
    });

    // Lifecycle & purchase — lihat bagian 5b untuk daftar lengkap event yang tersedia.
    setHubReadyListener(() => console.log('Hub gfmc siap'));
    setHubClosedListener(() => console.log('Hub gfmc ditutup'));
    setModuleChangedListener((module) => console.log('Modul aktif:', module));
    setPurchaseCompletedListener((orderId, sku) =>
      console.log('Pembelian sukses:', orderId, sku)
    );
    setPurchaseFailedListener((reason) => console.log('Pembelian gagal:', reason));
  }, [
    init,
    setTokenRefresher,
    setSkuListener,
    setHubReadyListener,
    setHubClosedListener,
    setModuleChangedListener,
    setPurchaseCompletedListener,
    setPurchaseFailedListener,
  ]);

  useEffect(() => {
    if (lastError) {
      // lastError.code salah satu dari 10 GfmcErrorCode — lihat bagian 5c.
      console.error(`gfmc_react error [${lastError.code}]: ${lastError.message}`);
    }
  }, [lastError]);

  return (
    // ... UI kamu, panggil open(jwt) saat user perlu buka hub gfmc
    null
  );
}
```

### Opsi B — API imperatif (`GfmcReact`, dipakai di luar komponen React / service layer)

```ts
import { GfmcReact, GfmcEnv } from 'gfmc_react';

async function bootstrapGfmc() {
  await GfmcReact.init(GfmcEnv.SANDBOX, true);
  const version = await GfmcReact.getVersion();
  console.log('gfmc-sdk version:', version);

  const tokenSub = GfmcReact.addTokenRefreshListener((requestId) => {
    fetchFreshJwtFromMyBackend()
      .then((jwt) => GfmcReact.submitTokenRefresh(requestId, jwt))
      .catch((err) => console.error('Refresh token gagal:', err));
  });

  const skuSub = GfmcReact.addSkuSelectedListener((sku) => {
    console.log('SKU dipilih:', sku);
  });

  // simpan tokenSub/skuSub, panggil .remove() saat app/module di-unmount total
}

async function openHub(jwt: string) {
  await GfmcReact.open(jwt);
}
```

---

## 5. Alur token refresh (penting untuk dipahami)

```
Native SDK (gfmc-sdk)                gfmc_react (native module)          JS (app kamu)
       |                                     |                                |
       | GfmcSDK.setTokenRefresher{result -> |                                |
       |   ... }  (dipanggil SDK saat token  |                                |
       |   lama dianggap kedaluwarsa)        |                                |
       |------------------------------------>|                                |
       |                                     | generate requestId (UUID),    |
       |                                     | simpan `result` di map        |
       |                                     | emit "onTokenRefreshRequested"|
       |                                     |------------------------------->|
       |                                     |                                | panggil backend
       |                                     |                                | untuk JWT baru
       |                                     |   submitTokenRefresh(id, jwt) |
       |                                     |<-------------------------------|
       |            result.emit(jwt)         |                                |
       |<------------------------------------|                                |
```

Poin penting:
- Setiap request punya `requestId` unik (UUID) — kalau ada beberapa permintaan refresh
  beruntun, jawab masing-masing dengan `requestId` yang sesuai, jangan asal pakai request
  terakhir.
- Kalau `submitTokenRefresh` tidak pernah dipanggil untuk suatu `requestId`, permintaan
  tersebut akan menggantung di sisi native (tidak ada timeout otomatis di level wrapper ini)
  — pastikan `setTokenRefresher`/`setTokenRefresher` callback kamu selalu resolve atau
  reject dengan wajar.
- `setTokenRefresher`/`addTokenRefreshListener` sebaiknya didaftarkan sekali di awal
  lifecycle app (mis. di komponen root), bukan di komponen yang sering mount/unmount, supaya
  tidak ada request refresh yang terlewat saat komponen sedang unmounted.
- Kalau proses refresh di JS gagal (mis. backend down), **wajib** panggil
  `GfmcReact.failTokenRefresh(requestId, message)` (atau biarkan `useGfmcSdk()` melakukannya
  otomatis lewat `setTokenRefresher` yang reject/throw) — kalau tidak, request yang menggantung
  di native tidak akan pernah selesai karena `GfmcRefreshResult.fail()` tidak pernah terpanggil.

---

## 5b. Event lifecycle hub & purchase

Selain token-refresh dan SKU, native `GfmcSDKListener` mengirim event berikut, semuanya sudah
di-wire di `GfmcReactModule.kt` dan diteruskan sebagai event JS:

| Event native | Payload JS | Setter di `useGfmcSdk()` | Listener di `GfmcReact` |
| --- | --- | --- | --- |
| `onHubReady()` | `{}` | `setHubReadyListener(cb)` | `addHubReadyListener(cb)` |
| `onHubClosed()` | `{}` | `setHubClosedListener(cb)` | `addHubClosedListener(cb)` |
| `onShareRequested(title, url)` | `{ title, url }` | `setShareRequestedListener(cb)` | `addShareRequestedListener(cb)` |
| `onError(error, message)` | `{ code, message }` | otomatis mengisi `lastError` | `addErrorListener(cb)` |
| `onModuleChanged(module)` | `{ module }` | `setModuleChangedListener(cb)` | `addModuleChangedListener(cb)` |
| `onPurchaseCompleted(orderId, sku)` | `{ orderId, sku }` | `setPurchaseCompletedListener(cb)` | `addPurchaseCompletedListener(cb)` |
| `onPurchaseFailed(reason)` | `{ reason }` | `setPurchaseFailedListener(cb)` | `addPurchaseFailedListener(cb)` |

`module` bertipe `GfmcModuleName` (`'CINEMA' | 'GAME' | 'SHOP'`), cermin 1:1 dari enum native
`GfmcModule`.

## 5c. Kode error (`GfmcErrorCode`)

`onError`/`lastError` memakai 10 kode berikut (cermin 1:1 dari enum native `GfmcSDKError`) —
bukan cuma `NETWORK_ERROR`/`WEBVIEW_OUTDATED` seperti versi dokumentasi sebelumnya:

| Kode | Keterangan |
| --- | --- |
| `AUTH_FAILED` | Autentikasi JWT ke hub gagal |
| `NETWORK_ERROR` | Kegagalan jaringan umum |
| `SESSION_EXPIRED` | Sesi/JWT sudah kedaluwarsa |
| `SDK_NOT_INITIALIZED` | SDK dipakai sebelum `init()` selesai |
| `WEBVIEW_UNAVAILABLE` | WebView system tidak tersedia di device |
| `WEBVIEW_OUTDATED` | Versi WebView system terlalu lama |
| `WEBVIEW_RENDERER_GONE` | Proses renderer WebView crash/mati |
| `BILLING_UNAVAILABLE` | Google Play Billing tidak tersedia |
| `PURCHASE_FAILED` | Transaksi pembelian gagal |
| `VERIFY_FAILED` | Verifikasi pembelian di server gagal |

---

## 6. Linking lokal (development)

> Kalau kamu develop di app contoh bawaan repo ini (`example/`), **lewati bagian ini** — app
> itu sudah tersambung otomatis lewat Yarn workspaces, tidak perlu `npm link`/`yalc` sama
> sekali. Lihat [`example/INTEGRATION.md`](example/INTEGRATION.md).

Untuk app consumer lain (di luar repo ini) selama `gfmc_react` belum dipublish ke registry npm,
pakai salah satu dari tiga opsi berikut. **Opsi GitHub adalah cara yang dipakai `gfmc-react-example`
sekarang** — pakai ini kalau mau meniru cara consumer nyata mengonsumsi package ini.

### Opsi A — Instal dari GitHub (dipakai `gfmc-react-example`)

Repo ini live publik di [`github.com/BDN-ID/jessica-sdk-react`](https://github.com/BDN-ID/jessica-sdk-react).
`npm`/`yarn` bisa clone langsung dan otomatis menjalankan `prepare` (build bob) sendiri — tidak
perlu `npm run prepare`/`npm link`/`yalc` manual di sisi library:

```jsonc
// package.json app consumer
"dependencies": {
  "gfmc_react": "github:BDN-ID/jessica-sdk-react"
}
```

```sh
npm install
```

Disarankan pin ke commit/tag (`#<sha>` atau `#v0.1.0` setelah ada rilis bertag) supaya build
reproducible — tanpa pin, selalu ambil `main` terbaru.

### Opsi B — `npm link`

```sh
# di folder gfmc_react
npm run prepare
npm link

# di folder app consumer
npm link gfmc_react
```

### Opsi C — `yalc` (perilakunya lebih dekat ke install asli lewat registry)

```sh
npm install -g yalc

# di folder gfmc_react
npm run prepare
yalc publish

# di folder app consumer
yalc add gfmc_react
npm install
```

Setiap ada perubahan di `gfmc_react`, jalankan `npm run prepare && yalc push` dari folder
`gfmc_react` supaya app consumer otomatis dapat update tanpa `yalc add` ulang.

---

## 7. Troubleshooting

| Gejala | Kemungkinan penyebab | Solusi |
| --- | --- | --- |
| `Could not find com.sltr.gfmc:gfmc-sdk:1.2.9` saat gradle sync | Maven repo gfmc-sdk belum terdaftar di `settings.gradle.kts` app | Ikuti [3.1](#31-daftarkan-maven-repo-gfmc-sdk) |
| `TurboModuleRegistry.getEnforcing(...): 'GfmcReact' could not be found` | Autolinking belum jalan / build lama masih terpakai | Rebuild app (`cd android && ./gradlew clean`), pastikan bukan Expo Go |
| `new NativeEventEmitter() was called with a non-null argument...` (warning) | Native module tidak mengimplementasikan `addListener`/`removeListeners` dengan benar | Pastikan versi `gfmc_react` yang dipakai sudah termasuk fix ini (sudah ada sejak awal implementasi) |
| Event `onTokenRefreshRequested`/`onSkuSelected`/lifecycle tidak pernah terpanggil di JS | Listener didaftarkan setelah SDK sempat emit duluan, atau `init()` belum pernah dipanggil | Pastikan semua `set*Listener`/`add*Listener` didaftarkan **sebelum** atau **bersamaan** dengan `init()`, idealnya di komponen root |
| Request refresh token menggantung selamanya di native | `submitTokenRefresh`/`failTokenRefresh` tidak pernah dipanggil untuk `requestId` yang bersangkutan | Pastikan `setTokenRefresher` callback kamu selalu resolve atau reject — `useGfmcSdk()` otomatis memanggil `failTokenRefresh` saat reject, tapi kalau pakai API imperatif manual, panggil sendiri |
| Host `PRODUCTION` tidak bisa diakses | Memang belum aktif di versi SDK 1.2.9 | Pakai `GfmcEnv.SANDBOX` |

---

## 8. Checklist sebelum production

- [ ] `settings.gradle.kts` app sudah punya maven repo gfmc-sdk (bagian 3.1).
- [ ] New Architecture aktif di app (`newArchEnabled=true`).
- [ ] `init()` dipanggil dengan environment yang benar (`GfmcEnv.SANDBOX` selama PRODUCTION
      belum aktif).
- [ ] `setTokenRefresher`/`addTokenRefreshListener` sudah terhubung ke endpoint refresh JWT
      yang sesungguhnya (bukan JWT dummy), dan menangani kegagalan (reject/throw) dengan wajar
      supaya `failTokenRefresh` otomatis terpanggil.
- [ ] Listener event di-*unsubscribe* dengan benar saat komponen unmount (`.remove()`), untuk
      mencegah memory leak / listener ganda.
- [ ] `lastError` (dari `useGfmcSdk`) ditangani di UI untuk seluruh 10 `GfmcErrorCode` yang
      relevan (lihat [5c](#5c-kode-error-gfmcerrorcode)), bukan cuma `NETWORK_ERROR` /
      `WEBVIEW_OUTDATED`.
- [ ] Event lifecycle hub & purchase (`onHubReady`/`onHubClosed`/`onModuleChanged`/
      `onPurchaseCompleted`/`onPurchaseFailed`/`onShareRequested`, lihat
      [5b](#5b-event-lifecycle-hub--purchase)) sudah ditangani sesuai kebutuhan UX app.
