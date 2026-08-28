package com.bdnid.gfmcreact

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.sltr.gfmc.GfmcModule
import com.sltr.gfmc.GfmcRefreshResult
import com.sltr.gfmc.GfmcSDK
import com.sltr.gfmc.GfmcSDKError
import com.sltr.gfmc.GfmcSDKEnv
import com.sltr.gfmc.GfmcSDKListener
import com.sltr.gfmc.GfmcTokenRefresher
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Implementasi native TurboModule yang membungkus `gfmc-sdk` (com.sltr.gfmc:gfmc-sdk:1.2.9).
 *
 * Package `com.sltr.gfmc.*` sudah dikonfirmasi lewat `javap` terhadap `classes.jar` hasil
 * ekstrak AAR asli (`gfmc-sdk-1.2.9.aar`), begitu juga signature seluruh interface publiknya
 * (`GfmcSDKListener`, `GfmcTokenRefresher`, `GfmcRefreshResult`, dst).
 */
class GfmcReactModule(reactContext: ReactApplicationContext) :
  NativeGfmcReactSpec(reactContext) {

  // Menyimpan pending token-refresh request dari native SDK (objek `GfmcRefreshResult` penuh,
  // bukan cuma closure emit), keyed dengan UUID per request, supaya jawaban dari JS
  // (submitTokenRefresh / failTokenRefresh) bisa diarahkan ke request yang tepat — baik untuk
  // kasus sukses (emit) maupun gagal (fail).
  private val pendingTokenRefreshRequests = ConcurrentHashMap<String, GfmcRefreshResult>()

  init {
    GfmcSDK.setTokenRefresher(object : GfmcTokenRefresher {
      override fun refresh(result: GfmcRefreshResult) {
        val requestId = UUID.randomUUID().toString()
        pendingTokenRefreshRequests[requestId] = result

        val payload: WritableMap = Arguments.createMap().apply {
          putString("requestId", requestId)
        }
        sendEvent(EVENT_TOKEN_REFRESH_REQUESTED, payload)
      }
    })

    GfmcSDK.setSkuListener { sku ->
      val payload: WritableMap = Arguments.createMap().apply {
        putString("sku", sku)
      }
      sendEvent(EVENT_SKU_SELECTED, payload)
    }

    GfmcSDK.setListener(reactApplicationContext, object : GfmcSDKListener {
      override fun onHubReady() {
        sendEvent(EVENT_HUB_READY, Arguments.createMap())
      }

      override fun onHubClosed() {
        sendEvent(EVENT_HUB_CLOSED, Arguments.createMap())
      }

      override fun onShareRequested(title: String, url: String) {
        sendEvent(
          EVENT_SHARE_REQUESTED,
          Arguments.createMap().apply {
            putString("title", title)
            putString("url", url)
          }
        )
      }

      override fun onError(error: GfmcSDKError, message: String) {
        sendEvent(
          EVENT_ERROR,
          Arguments.createMap().apply {
            putString("code", error.name)
            putString("message", message)
          }
        )
      }

      override fun onModuleChanged(module: GfmcModule) {
        sendEvent(
          EVENT_MODULE_CHANGED,
          Arguments.createMap().apply { putString("module", module.name) }
        )
      }

      override fun onPurchaseCompleted(orderId: String, sku: String) {
        sendEvent(
          EVENT_PURCHASE_COMPLETED,
          Arguments.createMap().apply {
            putString("orderId", orderId)
            putString("sku", sku)
          }
        )
      }

      override fun onPurchaseFailed(reason: String) {
        sendEvent(
          EVENT_PURCHASE_FAILED,
          Arguments.createMap().apply { putString("reason", reason) }
        )
      }
    })
  }

  override fun getName(): String = NAME

  // NOTE: nama method sengaja "configure", bukan "init" — nama TurboModule mentah "init" di
  // spec (NativeGfmcReact.ts) akan tabrakan dengan ARC "init family" Objective-C di sisi iOS
  // (lihat komentar di spec). Kotlin sendiri tidak kena masalah ini, tapi nama method wajib
  // sama persis dengan spec supaya override valid.
  override fun configure(env: String?, enableLogging: Boolean?, promise: Promise) {
    try {
      val envEnum = when (env?.uppercase()) {
        "PRODUCTION" -> GfmcSDKEnv.PRODUCTION
        "DEV" -> GfmcSDKEnv.DEV
        "SANDBOX", null -> GfmcSDKEnv.SANDBOX
        else -> GfmcSDKEnv.SANDBOX
      }

      GfmcSDK.init(reactApplicationContext, envEnum, enableLogging ?: false)
      promise.resolve(null)
    } catch (error: Exception) {
      // TODO: petakan ke kode error GfmcSDKError (NETWORK_ERROR / WEBVIEW_OUTDATED) begitu
      // struktur exception SDK terkonfirmasi.
      promise.reject("GFMC_INIT_ERROR", error.message, error)
    }
  }

  override fun open(jwt: String, promise: Promise) {
    try {
      val activity = getCurrentActivity() ?: reactApplicationContext
      GfmcSDK.open(activity, jwt)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("GFMC_OPEN_ERROR", error.message, error)
    }
  }

  override fun getVersion(promise: Promise) {
    try {
      // `GfmcSDK.version` adalah objek `GfmcSDKVersion` (bukan String) — Promise React Native
      // cuma bisa serialize primitif/String/Map/Array, jadi resolve dengan `SDK_VERSION`
      // (String polos, mis. "2.3.9") sesuai kontrak `getVersion(): Promise<string>` di JS.
      promise.resolve(GfmcSDK.SDK_VERSION)
    } catch (error: Exception) {
      promise.reject("GFMC_VERSION_ERROR", error.message, error)
    }
  }

  override fun submitTokenRefresh(requestId: String, jwt: String) {
    pendingTokenRefreshRequests.remove(requestId)?.emit(jwt)
  }

  override fun failTokenRefresh(requestId: String, message: String) {
    pendingTokenRefreshRequests.remove(requestId)?.fail(message)
  }

  // NativeEventEmitter (JS) membutuhkan addListener/removeListeners agar tidak memunculkan
  // warning "new NativeEventEmitter() was called with a non-null argument...". Module ini tidak
  // perlu melakukan apa pun di sini karena GfmcSDK selalu emit lewat listener yang sudah
  // didaftarkan sekali di blok `init` di atas.
  override fun addListener(eventName: String) {
    // No-op, dibutuhkan oleh kontrak NativeEventEmitter.
  }

  override fun removeListeners(count: Double) {
    // No-op, dibutuhkan oleh kontrak NativeEventEmitter.
  }

  private fun sendEvent(eventName: String, payload: WritableMap) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, payload)
  }

  companion object {
    const val NAME = "GfmcReact"
    private const val EVENT_TOKEN_REFRESH_REQUESTED = "onTokenRefreshRequested"
    private const val EVENT_SKU_SELECTED = "onSkuSelected"
    private const val EVENT_HUB_READY = "onHubReady"
    private const val EVENT_HUB_CLOSED = "onHubClosed"
    private const val EVENT_SHARE_REQUESTED = "onShareRequested"
    private const val EVENT_ERROR = "onError"
    private const val EVENT_MODULE_CHANGED = "onModuleChanged"
    private const val EVENT_PURCHASE_COMPLETED = "onPurchaseCompleted"
    private const val EVENT_PURCHASE_FAILED = "onPurchaseFailed"
  }
}
