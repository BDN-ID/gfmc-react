# Rencana Publish — gfmc_react

Dokumen ini dibuat oleh peran Planner/Lead Architect untuk menjawab: **bagaimana supaya `gfmc_react` gampang dipakai project lain?** Berdasarkan kondisi repo per 2026-08-13.

## Ringkasan Keputusan

- **Registry: npm publik** (`registry.npmjs.org`) — sudah dikonfigurasi di `publishConfig` hasil scaffold. Tidak ada alasan kuat untuk private/internal registry: source `gfmc_react` tidak berisi rahasia apa pun (kredensial ada di sisi consumer app), dan native SDK yang dibungkusnya (`gfmc-sdk`) sendiri didistribusikan publik tanpa token lewat GitHub gh-pages. Private registry cuma nambah friksi ke tujuan "mudah dipakai project lain".
- **Nama package `gfmc_react` masih tersedia** — dicek `npm view gfmc_react` → 404 (belum ada yang publish), aman dipakai sesuai kontrak yang sudah dipakai `gfmc-react-example`.
- **Publish WAJIB lewat CI, bukan dari mesin lokal developer** — supaya tidak ada npm token berumur panjang tersimpan di laptop siapa pun.

## Blocker — Wajib Selesai Sebelum Publish Pertama

1. **Verifikasi package Kotlin asli `GfmcSDK`/`GfmcSDKEnv`.** Import saat ini di `android/src/main/java/com/bdnid/gfmcreact/GfmcReactModule.kt` masih asumsi `com.sltr.gfmc.*` (README publik gfmc-sdk tidak menyebut package path). Extract AAR `gfmc-sdk-1.2.9.aar` dari maven gh-pages, decompile/`javap` `classes.jar`, konfirmasi package + nama class `Result` callback token-refresher. Publish versi dengan import salah = native crash total di semua consumer.
2. **`gfmc_react/example/android/settings.gradle` belum daftar maven repo gfmc-sdk.** Beda dengan `gfmc-react-example` (project sibling) yang sudah dibenerin, contoh bawaan bob di dalam `gfmc_react/example` ini masih kosong — job `build-android` di `.github/workflows/ci.yml` akan gagal resolve dependency kalau CI ini jalan. Tambahkan blok yang sama:
   ```
   dependencyResolutionManagement {
       repositories {
           maven { url 'https://raw.githubusercontent.com/BDN-ID/gfmc-sdk/gh-pages/' }
       }
   }
   ```
3. **Belum ada test otomatis.** Jest sudah terpasang dari scaffold tapi belum ada file test. Minimal: test `useGfmcSdk()` dengan `NativeModules.GfmcReact` di-mock — cover `init`/`open`/`getVersion` resolve, event listener native ke-trigger, dan `submitTokenRefresh` terpanggil dengan `requestId` yang benar.
4. **Belum pernah dicoba build & run Android sungguhan.** Environment kerja saat ini belum punya `ANDROID_HOME`. Sebelum rilis pertama, WAJIB sekali build sukses + jalan di device/emulator nyata — jangan publish versi yang cuma lolos `tsc`/`lint` tapi belum pernah tercompile native end-to-end.

## Rencana Registry & Auth

- Publish npm publik, nama unscoped `gfmc_react` (sesuai kontrak yang sudah dipakai kedua project — jangan ganti ke scoped name, breaking untuk `gfmc-react-example`).
- Kalau ke depan org butuh private/internal-only: alternatif scoped `@bdn-id/gfmc-react` via GitHub Packages, tapi ini butuh consumer setup token baca di `.npmrc` — **tidak direkomendasikan sekarang**, bertentangan dengan tujuan "mudah dipakai project lain".
- Buat npm automation token scope **Publish only**, simpan sebagai GitHub Actions secret `NPM_TOKEN`. Jangan `npm login` dari mesin lokal untuk rilis rutin.

## CI/CD Tambahan yang Perlu Dibuat

File baru `gfmc_react/.github/workflows/publish.yml`, trigger `on: push: tags: ['v*']`:
1. Checkout + `uses: ./.github/actions/setup` (reuse action yang sudah ada).
2. `yarn prepare` (build bob → `lib/`).
3. `npm publish --provenance --access public` pakai `NPM_TOKEN` dari secrets.

Ubah `release-it.npm.publish` di `package.json` dari (default) `true` jadi **`false`** — biar `release-it` cuma urus bump versi, changelog, git tag, dan GitHub Release; publish npm murni jadi tanggung jawab CI (`publish.yml`). Ini menghindari publish dobel / dua source of truth.

Alur rilis akhir:
1. Commit pakai Conventional Commits (`feat:`, `fix:`, dst — commitlint sudah enforce via lefthook, jangan dilonggarkan).
2. `yarn release` → release-it bump semver otomatis dari commit history, update CHANGELOG, commit `chore: release x.y.z`, tag `vx.y.z`, push.
3. Tag ter-push → `publish.yml` jalan di CI → `npm publish` otomatis.
4. Verifikasi: `npm view gfmc_react`.

## Versioning

- Semver ketat. Selama masih `0.x.x`, breaking change kontrak API (`GfmcEnv`/`GfmcError`/`GfmcReact`/`useGfmcSdk`) boleh terjadi tanpa major bump per konvensi npm — tapi WAJIB catat di CHANGELOG dan beri tahu tim yang pegang `gfmc-react-example`.
- Catat compatibility matrix di README: versi `gfmc_react` mana teruji dengan versi `gfmc-sdk` native yang mana (sekarang: `gfmc_react` 0.1.x ↔ `gfmc-sdk` 1.2.9 / SDK 2.3.9, WAJIB `GfmcSDKEnv.SANDBOX` karena PRODUCTION host mati di versi ini).

## Supaya Gampang Dipakai Project Lain

1. Setelah publish: project lain tinggal `npm install gfmc_react` (atau yarn/pnpm) — tidak perlu `file:`/`npm link`/`yalc` lagi.
2. Satu langkah manual yang **tetap wajib** dan tidak bisa diotomatisasi oleh `npm install` (keterbatasan Gradle `dependencyResolutionManagement`): daftarkan maven repo gh-pages gfmc-sdk di `settings.gradle.kts` consumer — sudah dijelaskan di `INTEGRATION.md`, pastikan langkah ini ditaruh paling atas/paling jelas di README juga.
3. Tambahkan Quick Start 3 langkah di baris paling atas README: install → tambah maven repo → `useGfmcSdk()` contoh singkat.
4. Nice-to-have: badge npm version + CI status di README (murah, nambah kepercayaan tim lain buat adopsi).

## Checklist Publish Pertama (v0.1.0)

- [ ] Fix maven repo di `example/android/settings.gradle`
- [ ] Verifikasi package Kotlin asli dari AAR, perbaiki import kalau beda
- [ ] Tulis test dasar `useGfmcSdk()` (mock native module)
- [ ] Build + run sukses di device/emulator Android nyata
- [ ] Buat `publish.yml` + secret `NPM_TOKEN` di GitHub repo
- [ ] Set `release-it.npm.publish = false` di `package.json`
- [ ] `npm pack --dry-run` — cek isi tarball (`android/`, `lib/`, `src/` ikut; `example/`, `node_modules/` tidak ikut)
- [ ] `yarn release` → tag → CI publish jalan → `npm view gfmc_react` konfirmasi live
- [ ] Update `gfmc-react-example`: ganti dependency dari `file:../gfmc_react` ke versi published (`"gfmc_react": "^0.1.0"`) untuk validasi akhir instalasi lewat registry beneran, bukan symlink lokal

## Delegasi

- Blocker #1–#3 dan setup CI publish → **Plugin Developer agent** (scope repo `gfmc_react`).
- Build+run di device Android nyata → butuh environment dengan Android SDK terpasang, di luar kapasitas environment kerja saat ini — dicatat sebagai action item untuk user.
- Update dependency di `gfmc-react-example` pasca-publish → **Example Developer agent**.
