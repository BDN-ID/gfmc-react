# gfmc_react

React Native TurboModule wrapper untuk native SDK BDN-ID:

- **Android** — `gfmc-sdk`, artifact Maven `com.sltr.gfmc:gfmc-sdk:1.2.9`.
- **iOS** — `JessicaSDK`, dari [`github.com/BDN-ID/gfmc-ios`](https://github.com/BDN-ID/gfmc-ios)
  versi 1.16.0 (minimum **iOS 15**), sudah di-vendor langsung di dalam package ini
  (`ios/Frameworks/JessicaSDK.xcframework`) — tidak perlu setup SPM/CocoaPods tambahan apa
  pun di app consumer, cukup `pod install`.

## Instalasi

```sh
npm install gfmc_react
# atau
yarn add gfmc_react
```

### Wajib: daftarkan Maven repo gfmc-sdk di app yang mengonsumsi library ini

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

> Catatan versi: pada `gfmc-sdk` 1.2.9, host `PRODUCTION` belum bisa diakses. Selalu gunakan
> `GfmcEnv.SANDBOX` sebagai default di development/contoh sampai ada pemberitahuan lebih lanjut
> dari BDN-ID.

### iOS — tidak perlu setup tambahan

`JessicaSDK.xcframework` sudah ikut ter-vendor di dalam package (`s.vendored_frameworks` di
`GfmcReact.podspec`), jadi `pod install` di folder `ios/` app consumer sudah cukup. Tidak perlu
menambahkan SPM package `gfmc-ios` secara manual maupun mengubah `Podfile`.

Implementasi native-nya ditulis di Swift (`ios/GfmcReactImpl.swift`), bukan Objective-C, karena
`JessicaSDK` adalah framework Swift murni (pakai `async`/`throws`) yang tidak bisa dipanggil
langsung dari Objective-C. `ios/GfmcReact.mm` cuma jadi "kabel" tipis ke situ — lihat komentar
di kedua file untuk detail. Minimum target **iOS 15** (mengikuti `JessicaSDK`).

## Penggunaan

### API imperatif

```ts
import { GfmcReact, GfmcEnv } from 'gfmc_react';

await GfmcReact.init(GfmcEnv.SANDBOX, true); // enableLogging = true
const version = await GfmcReact.getVersion(); // String polos, mis. "2.3.9"
await GfmcReact.open(jwt);

const tokenRefreshSub = GfmcReact.addTokenRefreshListener((requestId) => {
  fetchFreshJwtFromMyBackend()
    .then((freshJwt) => GfmcReact.submitTokenRefresh(requestId, freshJwt))
    .catch((err) =>
      // WAJIB: kalau gagal, beri tahu native lewat failTokenRefresh — kalau tidak,
      // request refresh yang sedang menggantung di native tidak akan pernah selesai.
      GfmcReact.failTokenRefresh(requestId, err.message ?? 'Refresh gagal')
    );
});

const skuSub = GfmcReact.addSkuSelectedListener((sku) => {
  console.log('SKU dipilih user:', sku);
});

// jangan lupa unsubscribe saat sudah tidak dipakai
tokenRefreshSub.remove();
skuSub.remove();
```

### React hook

```tsx
import { useEffect } from 'react';
import { useGfmcSdk, GfmcEnv } from 'gfmc_react';

function GfmcScreen() {
  const { init, open, version, setTokenRefresher, setSkuListener, lastError } =
    useGfmcSdk();

  useEffect(() => {
    init(GfmcEnv.SANDBOX, true);

    setTokenRefresher(async () => {
      const freshJwt = await fetchFreshJwtFromMyBackend();
      return freshJwt; // kalau reject/throw, native otomatis dijawab failTokenRefresh
    });

    setSkuListener((sku) => {
      console.log('SKU dipilih:', sku);
    });
  }, [init, setTokenRefresher, setSkuListener]);

  return null; // render UI kamu sendiri di sini
}
```

## Versi SDK — `SDK_VERSION` vs `version`

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

## Kode error (`GfmcErrorCode`)

Event `onError` (dan `lastError` dari `useGfmcSdk`) memakai 10 kode error berikut, cermin 1:1
dari enum native `GfmcSDKError`:

| Kode | Keterangan singkat |
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

## Event lifecycle hub & purchase

Selain `onTokenRefreshRequested`/`onSkuSelected`, wrapper ini juga meneruskan seluruh event dari
`GfmcSDKListener` native:

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

## Kontrak native module

- Nama module terdaftar sebagai `"GfmcReact"` (`TurboModuleRegistry.getEnforcing('GfmcReact')`).
- Event `onTokenRefreshRequested` — payload `{ requestId: string }`, dikirim setiap kali callback
  native `GfmcTokenRefresher.refresh(result)` dipanggil oleh SDK. Native module menyimpan objek
  `result: GfmcRefreshResult` penuh (di-key dengan UUID) sampai JS membalas lewat
  `submitTokenRefresh(requestId, jwt)` (memanggil `result.emit(jwt)`) atau
  `failTokenRefresh(requestId, message)` (memanggil `result.fail(message)`) kalau refresh gagal.
- Event `onSkuSelected` — payload `{ sku: string }`, one-way dari `GfmcSDK.setSkuListener`.
- Event `onHubReady` / `onHubClosed` — payload kosong, one-way dari `GfmcSDKListener`.
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

## Menyambungkan project lain sebelum publish ke registry

Repo ini sudah live publik di [`github.com/BDN-ID/jessica-sdk-react`](https://github.com/BDN-ID/jessica-sdk-react).
Selama belum ada rilis resmi ke npm registry, ada tiga opsi mengonsumsi `gfmc_react` dari
project lain (misal `gfmc-react-example`):

### Opsi A — Instal langsung dari GitHub (direkomendasikan)

Tidak butuh setup lokal apa pun di sisi library — `npm`/`yarn` clone repo ini sendiri lalu
otomatis menjalankan `prepare` (build bob) saat install. Ini paling dekat ke pengalaman
`npm install` beneran nanti setelah publish resmi:

```jsonc
// package.json project consumer
"dependencies": {
  "gfmc_react": "github:BDN-ID/jessica-sdk-react"
}
```

```sh
npm install
```

Pin ke commit/tag tertentu untuk build yang reproducible (`#<sha>` atau `#v0.1.0` setelah ada
tag rilis), contoh: `"gfmc_react": "github:BDN-ID/jessica-sdk-react#c5dd735"`. Tanpa pin, selalu
tarik branch default (`main`) terbaru.

### Opsi B — `npm link` (kalau develop `gfmc_react` & consumer bersamaan di mesin yang sama)

```sh
# di folder gfmc_react
npm run prepare   # build dulu supaya lib/ terisi
npm link

# di folder project consumer
npm link gfmc_react
```

### Opsi C — `yalc` (alternatif ke `npm link`, perilakunya lebih dekat ke install asli)

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

## App contoh (`example/`)

Folder `example/` berisi app React Native yang sudah tersambung otomatis ke library ini lewat
Yarn workspaces (tanpa `npm link`/`yalc`). Lihat [`example/INTEGRATION.md`](example/INTEGRATION.md)
untuk cara menjalankannya dan penjelasan kenapa integrasinya sesederhana itu.

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
