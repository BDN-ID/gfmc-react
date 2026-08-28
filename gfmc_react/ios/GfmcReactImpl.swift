import Foundation
import JessicaSDK
import React
import UIKit

/// Implementasi native yang membungkus `JessicaSDK` (dari `https://github.com/BDN-ID/gfmc-ios`,
/// versi 1.16.0) — cermin 1:1 dari `GfmcReactModule.kt` di sisi Android.
///
/// API publik `JessicaSDK` (typealias `Jessica` = `GfmcSDK`, dst) dikonfirmasi lewat inspeksi
/// `.swiftinterface` yang ada di dalam `JessicaSDK.xcframework` (setara `javap` yang dipakai di
/// sisi Android terhadap `classes.jar`), bukan dari dokumentasi — lihat komentar per-method di
/// bawah untuk detail signature aslinya.
///
/// Ditulis dalam Swift (bukan Objective-C++) karena `JessicaSDK` adalah framework Swift murni
/// (pakai `async`/`throws`, `struct`, default parameter) yang APInya tidak bisa dipanggil
/// langsung dari Objective-C. `GfmcReact.mm` meneruskan tiap method spec TurboModule ke sini.
@objc(GfmcReactImpl)
public final class GfmcReactImpl: NSObject, JessicaSDKDelegate {

  static let eventTokenRefreshRequested = "onTokenRefreshRequested"
  static let eventSkuSelected = "onSkuSelected"
  static let eventHubReady = "onHubReady"
  static let eventHubClosed = "onHubClosed"
  static let eventShareRequested = "onShareRequested"
  static let eventError = "onError"
  static let eventModuleChanged = "onModuleChanged"
  static let eventPurchaseCompleted = "onPurchaseCompleted"
  static let eventPurchaseFailed = "onPurchaseFailed"

  /// Daftar semua nama event, dipakai `GfmcReact.mm` untuk `supportedEvents`.
  @objc public static let allEvents: [String] = [
    eventTokenRefreshRequested, eventSkuSelected, eventHubReady, eventHubClosed,
    eventShareRequested, eventError, eventModuleChanged, eventPurchaseCompleted,
    eventPurchaseFailed,
  ]

  private weak var emitter: RCTEventEmitter?

  // Menyimpan continuation token-refresh yang sedang menggantung, keyed per requestId —
  // padanan Swift dari `ConcurrentHashMap<String, GfmcRefreshResult>` di Kotlin. `Jessica`
  // hanya expose overload closure `async throws -> String` (bukan objek result terpisah
  // seperti Android punya `GfmcRefreshResult`), jadi continuation inilah yang berperan
  // sebagai "result object" yang di-resolve nanti saat JS memanggil submitTokenRefresh /
  // failTokenRefresh.
  private let pendingLock = NSLock()
  private var pendingTokenRefreshContinuations: [String: CheckedContinuation<String, Error>] = [:]

  @objc public init(emitter: RCTEventEmitter) {
    self.emitter = emitter
    super.init()

    Task { @MainActor in
      Jessica.shared.setDelegate(self)

      Jessica.shared.setTokenRefresher { [weak self] in
        guard let self else {
          throw GfmcReactError.moduleDeallocated
        }
        return try await withCheckedThrowingContinuation { continuation in
          let requestId = UUID().uuidString
          self.pendingLock.lock()
          self.pendingTokenRefreshContinuations[requestId] = continuation
          self.pendingLock.unlock()
          self.sendEvent(Self.eventTokenRefreshRequested, ["requestId": requestId])
        }
      }

      Jessica.shared.setSKUListener { [weak self] sku in
        self?.sendEvent(Self.eventSkuSelected, ["sku": sku])
      }
    }
  }

  // MARK: - Spec TurboModule (dipanggil lewat forwarding dari GfmcReact.mm)

  // NOTE: nama method sengaja "configure", bukan "init" — lihat komentar di
  // src/NativeGfmcReact.ts soal kenapa nama "init" berbahaya untuk selector Objective-C
  // (ARC init family). Method ini dipanggil GfmcReact.mm lewat selector
  // `configure:enableLogging:resolve:reject:`.
  @objc public func configure(
    _ env: String?, enableLogging: NSNumber?,
    resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor in
      // `env` dikirim JS sebagai 'PRODUCTION' | 'SANDBOX' | 'DEV' (lihat GfmcEnv di
      // src/index.tsx); enum native `JessicaEnvironment` raw value-nya lowercase.
      let environment = JessicaEnvironment(rawValue: (env ?? "SANDBOX").lowercased()) ?? .sandbox
      let config = JessicaSDKConfig(
        environment: environment,
        isLoggingEnabled: enableLogging?.boolValue ?? false
      )
      Jessica.shared.configure(config)
      resolve(nil)
    }
  }

  @objc public func open(
    _ jwt: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor in
      _ = Jessica.shared.open(from: Self.topMostViewController(), jwt: jwt)
      resolve(nil)
    }
  }

  /// Cari view controller paling atas untuk jadi presenter `Jessica.shared.open(from:...)` —
  /// padanan `getCurrentActivity()` di Android. Sengaja pakai UIKit polos (bukan helper RN
  /// seperti `RCTPresentedViewController()`) supaya tidak bergantung pada modul internal React
  /// yang penamaannya bisa berubah antar versi RN.
  @MainActor
  private static func topMostViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let keyWindow =
      scenes.first(where: { $0.activationState == .foregroundActive })?.windows
      .first(where: { $0.isKeyWindow }) ?? scenes.first?.windows.first(where: { $0.isKeyWindow })

    guard var top = keyWindow?.rootViewController else { return nil }
    while let presented = top.presentedViewController {
      top = presented
    }
    return top
  }

  @objc public func getVersion(
    resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor in
      // `Jessica.version` adalah struct `JessicaSDKVersion`, bukan String — Promise React
      // Native cuma bisa serialize primitif, jadi resolve dengan `.name` (mis. "2.3.9"),
      // sepadan dengan `GfmcSDK.SDK_VERSION` (String polos) di sisi Android.
      resolve(Jessica.version.name)
    }
  }

  @objc public func submitTokenRefresh(_ requestId: String, jwt: String) {
    resumePendingTokenRefresh(requestId) { $0.resume(returning: jwt) }
  }

  @objc public func failTokenRefresh(_ requestId: String, message: String) {
    resumePendingTokenRefresh(requestId) {
      $0.resume(throwing: GfmcReactError.tokenRefreshFailed(message))
    }
  }

  private func resumePendingTokenRefresh(
    _ requestId: String, _ resume: (CheckedContinuation<String, Error>) -> Void
  ) {
    pendingLock.lock()
    let continuation = pendingTokenRefreshContinuations.removeValue(forKey: requestId)
    pendingLock.unlock()
    guard let continuation else { return }
    resume(continuation)
  }

  // MARK: - JessicaSDKDelegate (event dari native SDK ke JS)
  //
  // Semua method protokol ini sudah punya default no-op lewat extension, jadi cukup
  // override yang dipetakan ke event JS — sama dengan set event yang dipakai
  // `GfmcSDKListener` di Android.

  public func jessicaHubDidBecomeReady() {
    sendEvent(Self.eventHubReady, [:])
  }

  public func jessicaHubDidClose() {
    sendEvent(Self.eventHubClosed, [:])
  }

  public func jessicaHub(didRequestShare url: URL, title: String) {
    sendEvent(Self.eventShareRequested, ["title": title, "url": url.absoluteString])
  }

  public func jessicaHub(didFailWith error: JessicaSDKError, message: String) {
    sendEvent(Self.eventError, ["code": mapErrorCode(error), "message": message])
  }

  public func jessicaHub(didChangeModule module: JessicaModule) {
    sendEvent(Self.eventModuleChanged, ["module": module.rawValue.uppercased()])
  }

  // Overload (sku, transactionId) dipakai supaya payload persis sama dengan Android
  // (`onPurchaseCompleted` = { orderId, sku }), bukan overload `JessicaPurchase` penuh.
  public func jessicaHub(didCompletePurchase sku: String, transactionId: String) {
    sendEvent(Self.eventPurchaseCompleted, ["orderId": transactionId, "sku": sku])
  }

  // Overload (reason) dipakai supaya payload persis sama dengan Android
  // (`onPurchaseFailed` = { reason }), bukan overload yang menyertakan sku.
  public func jessicaHub(didFailPurchase reason: String) {
    sendEvent(Self.eventPurchaseFailed, ["reason": reason])
  }

  // MARK: - Helper

  private func sendEvent(_ name: String, _ body: [String: Any]) {
    emitter?.sendEvent(withName: name, body: body)
  }

  /// Cermin 1:1 dari `GfmcErrorCode` di `src/index.tsx`. `JessicaSDKError` (iOS, SDK 1.16.0)
  /// cuma punya 8 case — 2 case Android (`WEBVIEW_OUTDATED`, `WEBVIEW_RENDERER_GONE`) belum
  /// ada padanannya di iOS, jadi tidak pernah dikirim dari platform ini.
  private func mapErrorCode(_ error: JessicaSDKError) -> String {
    switch error {
    case .authFailed: return "AUTH_FAILED"
    case .networkError: return "NETWORK_ERROR"
    case .sessionExpired: return "SESSION_EXPIRED"
    case .sdkNotInitialized: return "SDK_NOT_INITIALIZED"
    case .webViewUnavailable: return "WEBVIEW_UNAVAILABLE"
    case .billingUnavailable: return "BILLING_UNAVAILABLE"
    case .purchaseFailed: return "PURCHASE_FAILED"
    case .verifyFailed: return "VERIFY_FAILED"
    }
  }
}

enum GfmcReactError: LocalizedError {
  case moduleDeallocated
  case tokenRefreshFailed(String)

  var errorDescription: String? {
    switch self {
    case .moduleDeallocated:
      return "GfmcReact module was deallocated"
    case .tokenRefreshFailed(let message):
      return message
    }
  }
}
