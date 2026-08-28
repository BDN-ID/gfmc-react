# Integrasi `gfmc_react` di App Contoh Ini

App contoh ini (`gfmc_react-example`) sudah tersambung ke package `gfmc_react` **secara
otomatis** lewat Yarn workspaces — tidak ada langkah `npm link`/`yalc`/install manual apa pun
yang perlu dilakukan. Dokumen ini menjelaskan kenapa integrasinya bisa sesimpel itu, dan cara
menjalankannya.

> Untuk detail lengkap API (`GfmcReact`, `useGfmcSdk`, daftar event, kode error, dst) yang
> dipakai app ini, lihat [`../README.md`](../README.md) dan [`../INTEGRATION.md`](../INTEGRATION.md)
> di root package — dokumen itu ditulis untuk app *consumer* mana pun (termasuk app ini).

## Kenapa integrasinya sudah otomatis (tidak perlu langkah manual)

Tiga hal ini sudah dikonfigurasi dari awal di repo ini, jadi app contoh selalu memakai kode
`gfmc_react` **versi paling baru** di folder ini setiap kali dijalankan — tidak ada versi lama
yang ketinggalan/nge-cache:

1. **Autolinking native** — `example/react-native.config.js` mengarahkan dependency
   `gfmc_react` langsung ke root repo ini (`path.join(__dirname, '..')`), jadi Gradle/CocoaPods
   membaca `android/`/`ios/` langsung dari source, bukan dari artifact yang sudah di-build.
2. **Resolusi JS lewat source langsung** — `example/metro.config.js` memakai
   `conditions: ['gfmc_react-source']`, dipasangkan dengan field `exports` di
   `../package.json` yang memetakan kondisi itu ke `../src/index.tsx`. Jadi Metro bundle
   langsung dari source TypeScript, bukan dari `lib/` hasil build — perubahan di `src/`
   langsung kepakai tanpa perlu `yarn prepare` dulu.
3. **Maven repo `gfmc-sdk` sudah didaftarkan** — `example/android/settings.gradle` sudah
   punya blok `dependencyResolutionManagement` yang mendaftarkan repo GitHub Pages tempat
   `gfmc-sdk` di-host, lengkap dengan `repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)`
   (WAJIB ada — tanpa baris ini, repo React Native Gradle plugin yang auto-ditambahkan ke tiap
   subproject akan menang dan bikin Gradle gagal resolve `com.sltr.gfmc:gfmc-sdk`). Jadi build
   Android app ini **langsung jalan** tanpa perlu edit gradle apa pun.

Karena tiga hal di atas, alur kerja sehari-hari cukup:

```sh
# dari root repo (bukan dari folder example/)
yarn install
yarn example android   # atau: cd example && yarn android
```

Tidak perlu `npm link`, `yalc`, atau publish dulu ke registry — beda dengan alur yang dipakai
project *consumer* eksternal (lihat bagian "Linking lokal" di `../INTEGRATION.md` untuk kasus
itu).

## Prasyarat

- Node sesuai `.nvmrc` di root (`v24.13.0`).
- Yarn 4 (dipakai lewat `.yarn/releases/yarn-4.11.0.cjs`, sudah otomatis lewat `yarn` command
  kalau Corepack aktif).
- JDK 17 untuk build Android.
- Android SDK (`ANDROID_HOME`/`ANDROID_SDK_ROOT`) dengan `compileSdk`/`buildTools` sesuai
  `example/android/build.gradle` (saat ini `compileSdkVersion 36`, `buildToolsVersion 36.0.0`,
  `ndkVersion 27.1.12297006` — kalau NDK ini belum terpasang, Gradle akan otomatis
  mengunduhnya lewat `sdkmanager` saat build pertama, cukup terima lisensinya).
- New Architecture aktif (`newArchEnabled=true` di `example/android/gradle.properties`, sudah
  di-set dari awal, tidak perlu diubah).

## Menjalankan app

```sh
# 1) install semua dependency (root + workspace example)
yarn install

# 2) jalankan Metro (opsional, langkah 3 akan menjalankannya otomatis kalau belum jalan)
yarn example start

# 3) build & jalankan di Android
yarn example android
```

Kalau lebih suka masuk ke folder `example/` langsung:

```sh
cd example
yarn android
```

Build pertama akan lebih lama karena Gradle perlu mengunduh dependency (termasuk `gfmc-sdk`
dari repo GitHub Pages) dan NDK kalau belum ada di cache lokal.

## Memakai SDK di `App.tsx`

Contoh di `example/src/App.tsx` sudah memakai hook `useGfmcSdk()`:

```tsx
import { GfmcEnv, useGfmcSdk } from 'gfmc_react';

const { init, open, version, setTokenRefresher, setSkuListener, lastError } = useGfmcSdk();
```

`useGfmcSdk()` juga menyediakan setter untuk event lifecycle hub & purchase
(`setHubReadyListener`, `setHubClosedListener`, `setModuleChangedListener`,
`setShareRequestedListener`, `setPurchaseCompletedListener`, `setPurchaseFailedListener`) dan
`failTokenRefresh` otomatis terpanggil kalau `setTokenRefresher` reject/throw — lihat contoh
lengkapnya di [`../README.md`](../README.md#event-lifecycle-hub--purchase).

## Troubleshooting khusus app contoh ini

| Gejala | Penyebab | Solusi |
| --- | --- | --- |
| `Unable to resolve module gfmc_react` | `node_modules` belum ter-link (symlink workspace hilang/rusak) | Jalankan `yarn install` ulang dari **root** repo (bukan dari `example/`) |
| Perubahan di `src/index.tsx` tidak muncul di app | Metro belum reload / cache lama | Reload app (`R` dua kali di Android) atau restart Metro dengan `yarn example start --reset-cache` |
| `Could not find com.sltr.gfmc:gfmc-sdk:1.2.9` saat gradle sync | `settings.gradle` app berubah dan menghapus blok `dependencyResolutionManagement`/`repositoriesMode` | Cek `example/android/settings.gradle` masih punya blok itu persis seperti dijelaskan di atas |
| Build Android pertama kali lama / berhenti di "Preparing Install NDK..." | NDK versi yang diminta belum ada di cache SDK lokal | Tunggu sampai selesai diunduh (sekali saja per mesin), atau install manual lewat `sdkmanager --install "ndk;27.1.12297006"` |
| `TurboModuleRegistry.getEnforcing(...): 'GfmcReact' could not be found` | Build native lama masih terpakai | `cd example/android && ./gradlew clean`, lalu build ulang |

Untuk kode error (`GfmcErrorCode`), daftar event, dan detail API lainnya, selalu rujuk ke
dokumentasi di root package: [`../README.md`](../README.md) dan
[`../INTEGRATION.md`](../INTEGRATION.md).
