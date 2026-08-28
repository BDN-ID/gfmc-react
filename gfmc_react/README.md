# gfmc_react

React Native TurboModule wrapper untuk native SDK BDN-ID — Android (`gfmc-sdk`) & iOS
(`JessicaSDK`).

React Native TurboModule wrapper for BDN-ID's native SDK — Android (`gfmc-sdk`) & iOS
(`JessicaSDK`).

**Bahasa:** [🇮🇩 Bahasa Indonesia](#-bahasa-indonesia) · [🇬🇧 English](#-english)

---

## 🇮🇩 Bahasa Indonesia

### Platform yang didukung

- **Android** — `gfmc-sdk`, artifact Maven `com.sltr.gfmc:gfmc-sdk:1.2.9`.
- **iOS** — `JessicaSDK` versi 1.16.0 (minimum **iOS 15**), sudah di-vendor langsung di dalam
  package ini (`ios/Frameworks/JessicaSDK.xcframework`) — tidak perlu setup SPM/CocoaPods
  tambahan apa pun di app consumer, cukup `pod install`.

> Catatan versi: pada `gfmc-sdk` (Android) 1.2.9, host `PRODUCTION` belum bisa diakses. Selalu
> gunakan `GfmcEnv.SANDBOX` sebagai default di development/contoh sampai ada pemberitahuan
> lebih lanjut dari BDN-ID.

### Cara pakai (step-by-step)

#### 1. Install package

```sh
npm install gfmc_react
# atau
yarn add gfmc_react
```

Repo ini belum rilis resmi ke npm registry — lihat [Menyambungkan project lain sebelum publish
ke registry](#menyambungkan-project-lain-sebelum-publish-ke-registry) untuk cara install
langsung dari GitHub.

#### 2. Setup native — Android

`gfmc-sdk` dihosting lewat GitHub Pages, bukan Maven Central/Google. Repo Maven-nya sudah
dideklarasikan di `android/build.gradle` milik `gfmc_react`, **tapi** kalau app kamu
menggunakan `dependencyResolutionManagement` di `settings.gradle.kts` (default template React
Native terbaru, biasanya dengan mode `FAIL_ON_PROJECT_REPOS`), deklarasi repo di level module
library akan **diabaikan**. Kamu wajib menambahkan repo ini secara eksplisit di
`settings.gradle.kts` level project:

```kotlin
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://raw.githubusercontent.com/BDN-ID/gfmc-sdk/gh-pages/") }
    }
}
```

Kalau app kamu masih pakai `build.gradle` (Groovy) lama tanpa `dependencyResolutionManagement`,
biasanya repo dari module library ini sudah cukup dan tidak perlu langkah tambahan.

#### 3. Setup native — iOS

Tidak ada langkah tambahan. `JessicaSDK.xcframework` sudah ikut ter-vendor di dalam package
(`s.vendored_frameworks` di `GfmcReact.podspec`), jadi cukup:

```sh
cd ios && pod install
```

Tidak perlu menambahkan SPM package `JessicaSDK` secara manual maupun mengubah `Podfile`.
Implementasi native-nya ditulis di Swift (`ios/GfmcReactImpl.swift`), bukan Objective-C, karena
`JessicaSDK` adalah framework Swift murni (pakai `async`/`throws`) yang tidak bisa dipanggil
langsung dari Objective-C — `ios/GfmcReact.mm` cuma jadi "kabel" tipis ke situ, lihat komentar
di kedua file untuk detail.

#### 4. Init SDK

Panggil sekali di awal (mis. saat komponen root mount), sebelum method lain dipakai:

```ts
import { GfmcReact, GfmcEnv } from 'gfmc_react';

await GfmcReact.init(GfmcEnv.SANDBOX, true); // enableLogging = true
const version = await GfmcReact.getVersion(); // String polos, mis. "2.3.9"
```

Atau lewat React hook:

```tsx
import { useEffect } from 'react';
import { useGfmcSdk, GfmcEnv } from 'gfmc_react';

function GfmcScreen() {
  const { init, version } = useGfmcSdk();

  useEffect(() => {
    init(GfmcEnv.SANDBOX, true);
  }, [init]);

  return null;
}
```

#### 5. Daftarkan token refresher (wajib sebelum `open()`)

SDK akan minta JWT baru kapan pun sesi hampir/sudah kedaluwarsa. **Wajib** menjawab lewat
`submitTokenRefresh`, atau `failTokenRefresh` kalau gagal — kalau tidak, request yang
menggantung di native tidak akan pernah selesai.

```ts
const tokenRefreshSub = GfmcReact.addTokenRefreshListener((requestId) => {
  fetchFreshJwtFromMyBackend()
    .then((freshJwt) => GfmcReact.submitTokenRefresh(requestId, freshJwt))
    .catch((err) =>
      GfmcReact.failTokenRefresh(requestId, err.message ?? 'Refresh gagal')
    );
});
```

Atau lewat hook, jauh lebih ringkas (reject/throw otomatis dijawab `failTokenRefresh`):

```tsx
setTokenRefresher(async () => {
  const freshJwt = await fetchFreshJwtFromMyBackend();
  return freshJwt;
});
```

#### 6. Buka Hub

```ts
await GfmcReact.open(jwt);
```

`jwt` harus token khusus minicinema yang didapat dari backend milik host sendiri — **bukan**
access token auth mentah milik host app.

#### 7. Dengarkan event (SKU, lifecycle hub, purchase, error)

```ts
const skuSub = GfmcReact.addSkuSelectedListener((sku) => {
  console.log('SKU dipilih user:', sku);
});

// jangan lupa unsubscribe saat sudah tidak dipakai
tokenRefreshSub.remove();
skuSub.remove();
```

Daftar lengkap event ada di [Event lifecycle hub & purchase](#event-lifecycle-hub--purchase) di
bawah, termasuk versi hook (`setHubReadyListener`, `setPurchaseCompletedListener`, dst).

### Referensi

#### Versi SDK — `SDK_VERSION` vs `version`

Native `GfmcSDK` punya dua cara membaca versi, dan keduanya **beda tipe**:

- `GfmcSDK.SDK_VERSION` — `String` polos (mis. `"2.3.9"`). Ini yang dipakai `getVersion()` /
  `useGfmcSdk().version` di wrapper ini, karena Promise React Native cuma bisa mengirim
  primitif/String/Map/Array — objek Kotlin custom (lihat poin berikut) tidak bisa lewat.
- `GfmcSDK.version` — objek `GfmcSDKVersion` (`major`, `minor`, `patch`, `versionCode`,
  `preRelease`, `artifactVersion`, `name`, `displayName`, `userAgent`, `isPreRelease`,
  `toString()`). Objek ini **tidak** diekspos lewat wrapper ini (tidak bisa lewat Promise RN
  tanpa mapping manual) — kalau butuh detail lebih dari `SDK_VERSION` (mis. `versionCode`),
  ini perlu ditambahkan sebagai method baru di native module yang meng-serialize field-nya ke
  `WritableMap` terlebih dahulu.

#### Kode error (`GfmcErrorCode`)

Event `onError` (dan `lastError` dari `useGfmcSdk`) memakai 10 kode error berikut, cermin 1:1
dari enum native `GfmcSDKError` (Android — 8 di antaranya juga berlaku untuk iOS, lihat catatan):

| Kode | Keterangan singkat | Android | iOS |
| --- | --- | :-: | :-: |
| `AUTH_FAILED` | Autentikasi JWT ke hub gagal | ✅ | ✅ |
| `NETWORK_ERROR` | Kegagalan jaringan umum | ✅ | ✅ |
| `SESSION_EXPIRED` | Sesi/JWT sudah kedaluwarsa | ✅ | ✅ |
| `SDK_NOT_INITIALIZED` | SDK dipakai sebelum `init()` selesai | ✅ | ✅ |
| `WEBVIEW_UNAVAILABLE` | WebView system tidak tersedia di device | ✅ | ✅ |
| `WEBVIEW_OUTDATED` | Versi WebView system terlalu lama | ✅ | ❌ |
| `WEBVIEW_RENDERER_GONE` | Proses renderer WebView crash/mati | ✅ | ❌ |
| `BILLING_UNAVAILABLE` | Billing (Play Billing / StoreKit) tidak tersedia | ✅ | ✅ |
| `PURCHASE_FAILED` | Transaksi pembelian gagal | ✅ | ✅ |
| `VERIFY_FAILED` | Verifikasi pembelian di server gagal | ✅ | ✅ |

#### Event lifecycle hub & purchase

Selain `onTokenRefreshRequested`/`onSkuSelected`, wrapper ini juga meneruskan seluruh event dari
`GfmcSDKListener` (Android) / `JessicaSDKDelegate` (iOS):

- `onHubReady()` — hub gfmc sudah siap ditampilkan.
- `onHubClosed()` — user menutup hub.
- `onShareRequested(title, url)` — SDK minta app menampilkan share sheet native.
- `onError(error, message)` — lihat tabel kode error di atas.
- `onModuleChanged(module)` — modul aktif berubah, `module` salah satu dari `'CINEMA' | 'GAME' | 'SHOP'`.
- `onPurchaseCompleted(orderId, sku)` — pembelian berhasil.
- `onPurchaseFailed(reason)` — pembelian gagal.

Lewat `useGfmcSdk()`, tiap event punya setter callback bergaya sama seperti
`setTokenRefresher`/`setSkuListener`:

```tsx
import { useEffect } from 'react';
import { useGfmcSdk, GfmcEnv } from 'gfmc_react';

function GfmcScreen() {
  const {
    init,
    setHubReadyListener,
    setHubClosedListener,
    setModuleChangedListener,
    setShareRequestedListener,
    setPurchaseCompletedListener,
    setPurchaseFailedListener,
    lastError,
  } = useGfmcSdk();

  useEffect(() => {
    init(GfmcEnv.SANDBOX, true);

    setHubReadyListener(() => console.log('Hub siap'));
    setHubClosedListener(() => console.log('Hub ditutup'));
    setModuleChangedListener((module) => console.log('Modul aktif:', module));
    setShareRequestedListener((title, url) => {
      // tampilkan share sheet native kamu sendiri, mis. lewat React Native `Share.share`
    });
    setPurchaseCompletedListener((orderId, sku) => {
      console.log('Pembelian sukses:', orderId, sku);
    });
    setPurchaseFailedListener((reason) => {
      console.log('Pembelian gagal:', reason);
    });
  }, [
    init,
    setHubReadyListener,
    setHubClosedListener,
    setModuleChangedListener,
    setShareRequestedListener,
    setPurchaseCompletedListener,
    setPurchaseFailedListener,
  ]);

  useEffect(() => {
    if (lastError) {
      // lastError.code salah satu dari 10 GfmcErrorCode di atas
      console.error(`gfmc error [${lastError.code}]: ${lastError.message}`);
    }
  }, [lastError]);

  return null;
}
```

Atau lewat API imperatif `GfmcReact` (di luar komponen React):

```ts
import { GfmcReact } from 'gfmc_react';

const hubReadySub = GfmcReact.addHubReadyListener(() => console.log('Hub siap'));
const errorSub = GfmcReact.addErrorListener((error) =>
  console.error(`gfmc error [${error.code}]: ${error.message}`)
);
const purchaseSub = GfmcReact.addPurchaseCompletedListener((orderId, sku) =>
  console.log('Pembelian sukses:', orderId, sku)
);

// jangan lupa unsubscribe saat sudah tidak dipakai
hubReadySub.remove();
errorSub.remove();
purchaseSub.remove();
```

#### Kontrak native module

- Nama module terdaftar sebagai `"GfmcReact"` (`TurboModuleRegistry.getEnforcing('GfmcReact')`).
- Event `onTokenRefreshRequested` — payload `{ requestId: string }`. Native module menyimpan
  request yang sedang menggantung (di-key dengan UUID) sampai JS membalas lewat
  `submitTokenRefresh(requestId, jwt)` atau `failTokenRefresh(requestId, message)`.
- Event `onSkuSelected` — payload `{ sku: string }`, one-way.
- Event `onHubReady` / `onHubClosed` — payload kosong, one-way.
- Event `onShareRequested` — payload `{ title: string, url: string }`.
- Event `onError` — payload `{ code: GfmcErrorCode, message: string }`.
- Event `onModuleChanged` — payload `{ module: 'CINEMA' | 'GAME' | 'SHOP' }`.
- Event `onPurchaseCompleted` — payload `{ orderId: string, sku: string }`.
- Event `onPurchaseFailed` — payload `{ reason: string }`.

Implementasi native ada di:
- Android: `android/src/main/java/com/bdnid/gfmcreact/GfmcReactModule.kt`
- iOS: `ios/GfmcReactImpl.swift` (logic) + `ios/GfmcReact.mm` (jembatan TurboModule)

> Nama method native untuk init SENGAJA `configure`, bukan `init` — API publik JS
> (`GfmcReact.init()` / `useGfmcSdk().init()`) tidak berubah, cuma method TurboModule mentah di
> baliknya yang di-rename, karena selector Objective-C apa pun yang segmen pertamanya "init"
> otomatis masuk "init family" ARC dan mengharuskan return type instancetype-compatible —
> method ini return `void`/`Promise`, jadi kalau tetap dinamai `init` build iOS gagal.

### Menyambungkan project lain sebelum publish ke registry

Repo ini sudah live publik di [`github.com/BDN-ID/gfmc-react`](https://github.com/BDN-ID/gfmc-react).
Selama belum ada rilis resmi ke npm registry, ada tiga opsi mengonsumsi `gfmc_react` dari
project lain (misal `gfmc-react-example`):

**Opsi A — Instal langsung dari GitHub (direkomendasikan).** Tidak butuh setup lokal apa pun di
sisi library — `npm`/`yarn` clone repo ini sendiri lalu otomatis menjalankan `prepare` (build
bob) saat install:

```jsonc
// package.json project consumer
"dependencies": {
  "gfmc_react": "github:BDN-ID/gfmc-react"
}
```

```sh
npm install
```

Pin ke commit/tag tertentu untuk build yang reproducible (`#<sha>` atau `#v0.2.0` setelah ada
tag rilis). Tanpa pin, selalu tarik branch default (`main`) terbaru.

**Opsi B — `npm link`** (kalau develop `gfmc_react` & consumer bersamaan di mesin yang sama):

```sh
# di folder gfmc_react
npm run prepare   # build dulu supaya lib/ terisi
npm link

# di folder project consumer
npm link gfmc_react
```

**Opsi C — `yalc`** (alternatif ke `npm link`, perilakunya lebih dekat ke install asli):

```sh
npm install -g yalc

# di folder gfmc_react
npm run prepare
yalc publish

# di folder project consumer
yalc add gfmc_react
npm install # atau yarn install, supaya native autolinking Android ikut ter-registrasi
```

Setiap kali ada perubahan di `gfmc_react`, ulangi `npm run prepare && yalc push` (dari folder
`gfmc_react`) supaya project consumer otomatis dapat update-nya.

### App contoh (`example/`)

Folder `example/` berisi app React Native yang sudah tersambung otomatis ke library ini lewat
Yarn workspaces (tanpa `npm link`/`yalc`). Lihat [`example/INTEGRATION.md`](example/INTEGRATION.md)
untuk cara menjalankannya dan penjelasan kenapa integrasinya sesederhana itu.

### Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

### License

MIT

---

## 🇬🇧 English

### Supported platforms

- **Android** — `gfmc-sdk`, Maven artifact `com.sltr.gfmc:gfmc-sdk:1.2.9`.
- **iOS** — `JessicaSDK` version 1.16.0 (minimum **iOS 15**), already vendored inside this
  package (`ios/Frameworks/JessicaSDK.xcframework`) — no extra SPM/CocoaPods setup needed in
  the consumer app, just `pod install`.

> Version note: on `gfmc-sdk` (Android) 1.2.9, the `PRODUCTION` host isn't reachable yet. Always
> default to `GfmcEnv.SANDBOX` in development/examples until BDN-ID announces otherwise.

### Usage (step-by-step)

#### 1. Install the package

```sh
npm install gfmc_react
# or
yarn add gfmc_react
```

This repo hasn't shipped an official npm release yet — see [Connecting other projects before
publishing to the registry](#connecting-other-projects-before-publishing-to-the-registry) for
installing straight from GitHub.

#### 2. Native setup — Android

`gfmc-sdk` is hosted via GitHub Pages, not Maven Central/Google. The Maven repo is already
declared in `gfmc_react`'s `android/build.gradle`, **but** if your app uses
`dependencyResolutionManagement` in `settings.gradle.kts` (default in recent React Native
templates, usually with `FAIL_ON_PROJECT_REPOS` mode), the module-level repo declaration will be
**ignored**. You must add this repo explicitly at the project-level `settings.gradle.kts`:

```kotlin
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://raw.githubusercontent.com/BDN-ID/gfmc-sdk/gh-pages/") }
    }
}
```

If your app still uses the old Groovy `build.gradle` without
`dependencyResolutionManagement`, the library module's own repo declaration is usually enough
and no extra step is needed.

#### 3. Native setup — iOS

No extra steps. `JessicaSDK.xcframework` is already vendored inside the package
(`s.vendored_frameworks` in `GfmcReact.podspec`), so just:

```sh
cd ios && pod install
```

No need to add the `JessicaSDK` SPM package manually or edit your `Podfile`. The native
implementation is written in Swift (`ios/GfmcReactImpl.swift`), not Objective-C, because
`JessicaSDK` is a pure Swift framework (uses `async`/`throws`) that can't be called directly
from Objective-C — `ios/GfmcReact.mm` is just a thin bridge to it, see the comments in both
files for details.

#### 4. Initialize the SDK

Call this once early on (e.g. when your root component mounts), before using any other method:

```ts
import { GfmcReact, GfmcEnv } from 'gfmc_react';

await GfmcReact.init(GfmcEnv.SANDBOX, true); // enableLogging = true
const version = await GfmcReact.getVersion(); // plain String, e.g. "2.3.9"
```

Or via the React hook:

```tsx
import { useEffect } from 'react';
import { useGfmcSdk, GfmcEnv } from 'gfmc_react';

function GfmcScreen() {
  const { init, version } = useGfmcSdk();

  useEffect(() => {
    init(GfmcEnv.SANDBOX, true);
  }, [init]);

  return null;
}
```

#### 5. Register a token refresher (required before `open()`)

The SDK will ask for a fresh JWT whenever the session is near/already expired. You **must**
answer via `submitTokenRefresh`, or `failTokenRefresh` on failure — otherwise the pending
request on the native side will hang forever.

```ts
const tokenRefreshSub = GfmcReact.addTokenRefreshListener((requestId) => {
  fetchFreshJwtFromMyBackend()
    .then((freshJwt) => GfmcReact.submitTokenRefresh(requestId, freshJwt))
    .catch((err) =>
      GfmcReact.failTokenRefresh(requestId, err.message ?? 'Refresh failed')
    );
});
```

Or via the hook, much shorter (a rejected/thrown promise auto-resolves to
`failTokenRefresh`):

```tsx
setTokenRefresher(async () => {
  const freshJwt = await fetchFreshJwtFromMyBackend();
  return freshJwt;
});
```

#### 6. Open the Hub

```ts
await GfmcReact.open(jwt);
```

`jwt` must be a minicinema-specific token obtained from your own backend — **not** the host
app's raw auth access token.

#### 7. Listen to events (SKU, hub lifecycle, purchase, error)

```ts
const skuSub = GfmcReact.addSkuSelectedListener((sku) => {
  console.log('User selected SKU:', sku);
});

// remember to unsubscribe when no longer needed
tokenRefreshSub.remove();
skuSub.remove();
```

The full event list is in [Hub & purchase lifecycle events](#hub--purchase-lifecycle-events)
below, including the hook variants (`setHubReadyListener`, `setPurchaseCompletedListener`, etc).

### Reference

#### SDK version — `SDK_VERSION` vs `version`

The native `GfmcSDK` has two ways to read the version, and they're **different types**:

- `GfmcSDK.SDK_VERSION` — a plain `String` (e.g. `"2.3.9"`). This is what `getVersion()` /
  `useGfmcSdk().version` use in this wrapper, because a React Native Promise can only carry
  primitives/String/Map/Array — a custom Kotlin object (see next point) can't cross that bridge.
- `GfmcSDK.version` — a `GfmcSDKVersion` object (`major`, `minor`, `patch`, `versionCode`,
  `preRelease`, `artifactVersion`, `name`, `displayName`, `userAgent`, `isPreRelease`,
  `toString()`). This object is **not** exposed through this wrapper (can't cross an RN Promise
  without manual mapping) — if you need more detail than `SDK_VERSION` (e.g. `versionCode`),
  it needs to be added as a new native module method that serializes its fields into a
  `WritableMap` first.

#### Error codes (`GfmcErrorCode`)

The `onError` event (and `lastError` from `useGfmcSdk`) uses the following 10 error codes, a
1:1 mirror of the native `GfmcSDKError` enum (Android — 8 of them also apply to iOS, see note):

| Code | Short description | Android | iOS |
| --- | --- | :-: | :-: |
| `AUTH_FAILED` | JWT authentication to the hub failed | ✅ | ✅ |
| `NETWORK_ERROR` | General network failure | ✅ | ✅ |
| `SESSION_EXPIRED` | Session/JWT has expired | ✅ | ✅ |
| `SDK_NOT_INITIALIZED` | SDK used before `init()` finished | ✅ | ✅ |
| `WEBVIEW_UNAVAILABLE` | System WebView isn't available on the device | ✅ | ✅ |
| `WEBVIEW_OUTDATED` | System WebView version is too old | ✅ | ❌ |
| `WEBVIEW_RENDERER_GONE` | The WebView renderer process crashed/died | ✅ | ❌ |
| `BILLING_UNAVAILABLE` | Billing (Play Billing / StoreKit) unavailable | ✅ | ✅ |
| `PURCHASE_FAILED` | The purchase transaction failed | ✅ | ✅ |
| `VERIFY_FAILED` | Server-side purchase verification failed | ✅ | ✅ |

#### Hub & purchase lifecycle events

Besides `onTokenRefreshRequested`/`onSkuSelected`, this wrapper also forwards every event from
`GfmcSDKListener` (Android) / `JessicaSDKDelegate` (iOS):

- `onHubReady()` — the gfmc hub is ready to be shown.
- `onHubClosed()` — the user closed the hub.
- `onShareRequested(title, url)` — the SDK asks the app to show a native share sheet.
- `onError(error, message)` — see the error code table above.
- `onModuleChanged(module)` — the active module changed, `module` is one of `'CINEMA' | 'GAME' | 'SHOP'`.
- `onPurchaseCompleted(orderId, sku)` — the purchase succeeded.
- `onPurchaseFailed(reason)` — the purchase failed.

Via `useGfmcSdk()`, every event has a setter callback in the same style as
`setTokenRefresher`/`setSkuListener`:

```tsx
import { useEffect } from 'react';
import { useGfmcSdk, GfmcEnv } from 'gfmc_react';

function GfmcScreen() {
  const {
    init,
    setHubReadyListener,
    setHubClosedListener,
    setModuleChangedListener,
    setShareRequestedListener,
    setPurchaseCompletedListener,
    setPurchaseFailedListener,
    lastError,
  } = useGfmcSdk();

  useEffect(() => {
    init(GfmcEnv.SANDBOX, true);

    setHubReadyListener(() => console.log('Hub ready'));
    setHubClosedListener(() => console.log('Hub closed'));
    setModuleChangedListener((module) => console.log('Active module:', module));
    setShareRequestedListener((title, url) => {
      // show your own native share sheet, e.g. via React Native's `Share.share`
    });
    setPurchaseCompletedListener((orderId, sku) => {
      console.log('Purchase succeeded:', orderId, sku);
    });
    setPurchaseFailedListener((reason) => {
      console.log('Purchase failed:', reason);
    });
  }, [
    init,
    setHubReadyListener,
    setHubClosedListener,
    setModuleChangedListener,
    setShareRequestedListener,
    setPurchaseCompletedListener,
    setPurchaseFailedListener,
  ]);

  useEffect(() => {
    if (lastError) {
      // lastError.code is one of the 10 GfmcErrorCode above
      console.error(`gfmc error [${lastError.code}]: ${lastError.message}`);
    }
  }, [lastError]);

  return null;
}
```

Or via the imperative `GfmcReact` API (outside a React component):

```ts
import { GfmcReact } from 'gfmc_react';

const hubReadySub = GfmcReact.addHubReadyListener(() => console.log('Hub ready'));
const errorSub = GfmcReact.addErrorListener((error) =>
  console.error(`gfmc error [${error.code}]: ${error.message}`)
);
const purchaseSub = GfmcReact.addPurchaseCompletedListener((orderId, sku) =>
  console.log('Purchase succeeded:', orderId, sku)
);

// remember to unsubscribe when no longer needed
hubReadySub.remove();
errorSub.remove();
purchaseSub.remove();
```

#### Native module contract

- The module is registered as `"GfmcReact"` (`TurboModuleRegistry.getEnforcing('GfmcReact')`).
- `onTokenRefreshRequested` event — payload `{ requestId: string }`. The native module keeps the
  pending request (keyed by UUID) until JS answers via `submitTokenRefresh(requestId, jwt)` or
  `failTokenRefresh(requestId, message)`.
- `onSkuSelected` event — payload `{ sku: string }`, one-way.
- `onHubReady` / `onHubClosed` events — empty payload, one-way.
- `onShareRequested` event — payload `{ title: string, url: string }`.
- `onError` event — payload `{ code: GfmcErrorCode, message: string }`.
- `onModuleChanged` event — payload `{ module: 'CINEMA' | 'GAME' | 'SHOP' }`.
- `onPurchaseCompleted` event — payload `{ orderId: string, sku: string }`.
- `onPurchaseFailed` event — payload `{ reason: string }`.

Native implementation lives in:
- Android: `android/src/main/java/com/bdnid/gfmcreact/GfmcReactModule.kt`
- iOS: `ios/GfmcReactImpl.swift` (logic) + `ios/GfmcReact.mm` (TurboModule bridge)

> The native init method is INTENTIONALLY named `configure`, not `init` — the public JS API
> (`GfmcReact.init()` / `useGfmcSdk().init()`) is unchanged, only the raw TurboModule method
> behind it was renamed, because any Objective-C selector whose first segment is "init"
> automatically falls into ARC's "init family" and requires an instancetype-compatible return
> type — this method returns `void`/`Promise`, so keeping it named `init` would break the iOS
> build.

### Connecting other projects before publishing to the registry

This repo is already live at [`github.com/BDN-ID/gfmc-react`](https://github.com/BDN-ID/gfmc-react).
Until there's an official npm registry release, there are three ways to consume `gfmc_react`
from another project (e.g. `gfmc-react-example`):

**Option A — Install directly from GitHub (recommended).** No local setup needed on the
library side — `npm`/`yarn` clones this repo itself and automatically runs `prepare` (bob
build) on install:

```jsonc
// consumer project's package.json
"dependencies": {
  "gfmc_react": "github:BDN-ID/gfmc-react"
}
```

```sh
npm install
```

Pin to a specific commit/tag for reproducible builds (`#<sha>` or `#v0.2.0` once a release tag
exists). Without a pin, it always pulls the latest default branch (`main`).

**Option B — `npm link`** (when developing `gfmc_react` and the consumer together on the same
machine):

```sh
# in the gfmc_react folder
npm run prepare   # build first so lib/ is populated
npm link

# in the consumer project folder
npm link gfmc_react
```

**Option C — `yalc`** (an alternative to `npm link` that behaves closer to a real install):

```sh
npm install -g yalc

# in the gfmc_react folder
npm run prepare
yalc publish

# in the consumer project folder
yalc add gfmc_react
npm install # or yarn install, so Android native autolinking also gets registered
```

Every time `gfmc_react` changes, repeat `npm run prepare && yalc push` (from the `gfmc_react`
folder) so the consumer project automatically picks up the update.

### Example app (`example/`)

The `example/` folder contains a React Native app already wired up to this library via Yarn
workspaces (no `npm link`/`yalc` needed). See
[`example/INTEGRATION.md`](example/INTEGRATION.md) for how to run it and why the integration is
this simple.

### Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

### License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
