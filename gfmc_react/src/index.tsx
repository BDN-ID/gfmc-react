import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import GfmcReactNative from './NativeGfmcReact';

/**
 * Environment gfmc-sdk. Sejak versi native 1.2.9, host PRODUCTION belum bisa diakses,
 * jadi gunakan SANDBOX sebagai default di semua contoh/dokumentasi.
 */
export enum GfmcEnv {
  PRODUCTION = 'PRODUCTION',
  SANDBOX = 'SANDBOX',
  DEV = 'DEV',
}

/**
 * Cermin 1:1 dari enum native `GfmcSDKError` (10 value). Dikirim lewat event `onError`
 * (`GfmcSDKListener.onError`) setiap kali SDK mengalami kondisi error runtime.
 */
export type GfmcErrorCode =
  | 'AUTH_FAILED'
  | 'NETWORK_ERROR'
  | 'SESSION_EXPIRED'
  | 'SDK_NOT_INITIALIZED'
  | 'WEBVIEW_UNAVAILABLE'
  | 'WEBVIEW_OUTDATED'
  | 'WEBVIEW_RENDERER_GONE'
  | 'BILLING_UNAVAILABLE'
  | 'PURCHASE_FAILED'
  | 'VERIFY_FAILED';

export type GfmcError = {
  code: GfmcErrorCode;
  message: string;
};

/** Cermin 1:1 dari enum native `GfmcModule`. */
export type GfmcModuleName = 'CINEMA' | 'GAME' | 'SHOP';

export type GfmcSubscription = {
  remove(): void;
};

type TokenRefreshRequestedEvent = { requestId: string };
type SkuSelectedEvent = { sku: string };
type ShareRequestedEvent = { title: string; url: string };
type ErrorEvent = { code: GfmcErrorCode; message: string };
type ModuleChangedEvent = { module: GfmcModuleName };
type PurchaseCompletedEvent = { orderId: string; sku: string };
type PurchaseFailedEvent = { reason: string };

const EVENT_TOKEN_REFRESH_REQUESTED = 'onTokenRefreshRequested';
const EVENT_SKU_SELECTED = 'onSkuSelected';
const EVENT_HUB_READY = 'onHubReady';
const EVENT_HUB_CLOSED = 'onHubClosed';
const EVENT_SHARE_REQUESTED = 'onShareRequested';
const EVENT_ERROR = 'onError';
const EVENT_MODULE_CHANGED = 'onModuleChanged';
const EVENT_PURCHASE_COMPLETED = 'onPurchaseCompleted';
const EVENT_PURCHASE_FAILED = 'onPurchaseFailed';

// NativeEventEmitter di new-arch tetap butuh instance native module yang punya
// addListener/removeListeners (sudah disediakan oleh spec TurboModule).
const gfmcEventEmitter = new NativeEventEmitter(GfmcReactNative);

/**
 * API imperatif, cermin 1:1 dari native `GfmcSDK`. Cocok dipakai di luar komponen React
 * (mis. di service/util) maupun langsung dari komponen.
 */
export const GfmcReact = {
  init(env: GfmcEnv = GfmcEnv.SANDBOX, enableLogging = false): Promise<void> {
    return GfmcReactNative.configure(env, enableLogging);
  },

  open(jwt: string): Promise<void> {
    return GfmcReactNative.open(jwt);
  },

  getVersion(): Promise<string> {
    return GfmcReactNative.getVersion();
  },

  addTokenRefreshListener(cb: (requestId: string) => void): GfmcSubscription {
    const subscription = gfmcEventEmitter.addListener(
      EVENT_TOKEN_REFRESH_REQUESTED,
      (event: Object) => cb((event as TokenRefreshRequestedEvent).requestId)
    );
    return { remove: () => subscription.remove() };
  },

  submitTokenRefresh(requestId: string, jwt: string): void {
    GfmcReactNative.submitTokenRefresh(requestId, jwt);
  },

  // Dipanggil saat refresher JS gagal mendapatkan JWT baru, supaya request native yang
  // sedang menggantung (menunggu `GfmcRefreshResult`) dijawab `fail()`, bukan diam saja.
  failTokenRefresh(requestId: string, message: string): void {
    GfmcReactNative.failTokenRefresh(requestId, message);
  },

  addSkuSelectedListener(cb: (sku: string) => void): GfmcSubscription {
    const subscription = gfmcEventEmitter.addListener(
      EVENT_SKU_SELECTED,
      (event: Object) => cb((event as SkuSelectedEvent).sku)
    );
    return { remove: () => subscription.remove() };
  },

  addHubReadyListener(cb: () => void): GfmcSubscription {
    const subscription = gfmcEventEmitter.addListener(EVENT_HUB_READY, () =>
      cb()
    );
    return { remove: () => subscription.remove() };
  },

  addHubClosedListener(cb: () => void): GfmcSubscription {
    const subscription = gfmcEventEmitter.addListener(EVENT_HUB_CLOSED, () =>
      cb()
    );
    return { remove: () => subscription.remove() };
  },

  addShareRequestedListener(
    cb: (title: string, url: string) => void
  ): GfmcSubscription {
    const subscription = gfmcEventEmitter.addListener(
      EVENT_SHARE_REQUESTED,
      (event: Object) => {
        const { title, url } = event as ShareRequestedEvent;
        cb(title, url);
      }
    );
    return { remove: () => subscription.remove() };
  },

  addErrorListener(cb: (error: GfmcError) => void): GfmcSubscription {
    const subscription = gfmcEventEmitter.addListener(
      EVENT_ERROR,
      (event: Object) => {
        const { code, message } = event as ErrorEvent;
        cb({ code, message });
      }
    );
    return { remove: () => subscription.remove() };
  },

  addModuleChangedListener(
    cb: (module: GfmcModuleName) => void
  ): GfmcSubscription {
    const subscription = gfmcEventEmitter.addListener(
      EVENT_MODULE_CHANGED,
      (event: Object) => cb((event as ModuleChangedEvent).module)
    );
    return { remove: () => subscription.remove() };
  },

  addPurchaseCompletedListener(
    cb: (orderId: string, sku: string) => void
  ): GfmcSubscription {
    const subscription = gfmcEventEmitter.addListener(
      EVENT_PURCHASE_COMPLETED,
      (event: Object) => {
        const { orderId, sku } = event as PurchaseCompletedEvent;
        cb(orderId, sku);
      }
    );
    return { remove: () => subscription.remove() };
  },

  addPurchaseFailedListener(cb: (reason: string) => void): GfmcSubscription {
    const subscription = gfmcEventEmitter.addListener(
      EVENT_PURCHASE_FAILED,
      (event: Object) => cb((event as PurchaseFailedEvent).reason)
    );
    return { remove: () => subscription.remove() };
  },
};

/**
 * Hook React untuk gfmc-sdk. Membungkus `GfmcReact` di atas, mengelola subscription
 * event native (token-refresh, sku-selected, lifecycle hub, error, purchase, dst) secara
 * otomatis lewat lifecycle komponen.
 */
export function useGfmcSdk() {
  const [version, setVersion] = useState<string | null>(null);
  const [lastError, setLastError] = useState<GfmcError | null>(null);

  const tokenRefresherRef = useRef<(() => Promise<string>) | null>(null);
  const skuListenerRef = useRef<((sku: string) => void) | null>(null);
  const hubReadyListenerRef = useRef<(() => void) | null>(null);
  const hubClosedListenerRef = useRef<(() => void) | null>(null);
  const purchaseCompletedListenerRef = useRef<
    ((orderId: string, sku: string) => void) | null
  >(null);
  const purchaseFailedListenerRef = useRef<((reason: string) => void) | null>(
    null
  );
  const moduleChangedListenerRef = useRef<
    ((module: GfmcModuleName) => void) | null
  >(null);
  const shareRequestedListenerRef = useRef<
    ((title: string, url: string) => void) | null
  >(null);

  useEffect(() => {
    const tokenRefreshSubscription = GfmcReact.addTokenRefreshListener(
      (requestId) => {
        const refresher = tokenRefresherRef.current;

        if (!refresher) {
          return;
        }

        refresher()
          .then((jwt) => GfmcReact.submitTokenRefresh(requestId, jwt))
          .catch((error: unknown) => {
            const message =
              error instanceof Error
                ? error.message
                : 'Failed to refresh token';

            setLastError({ code: 'NETWORK_ERROR', message });
            // Beri tahu native bahwa request ini gagal, supaya `GfmcRefreshResult` yang
            // sedang menggantung dijawab `fail()` — bukan hang selamanya di sisi native.
            GfmcReact.failTokenRefresh(requestId, message);
          });
      }
    );

    const skuSelectedSubscription = GfmcReact.addSkuSelectedListener((sku) => {
      skuListenerRef.current?.(sku);
    });

    const hubReadySubscription = GfmcReact.addHubReadyListener(() => {
      hubReadyListenerRef.current?.();
    });

    const hubClosedSubscription = GfmcReact.addHubClosedListener(() => {
      hubClosedListenerRef.current?.();
    });

    const shareRequestedSubscription = GfmcReact.addShareRequestedListener(
      (title, url) => {
        shareRequestedListenerRef.current?.(title, url);
      }
    );

    const errorSubscription = GfmcReact.addErrorListener((error) => {
      setLastError(error);
    });

    const moduleChangedSubscription = GfmcReact.addModuleChangedListener(
      (module) => {
        moduleChangedListenerRef.current?.(module);
      }
    );

    const purchaseCompletedSubscription =
      GfmcReact.addPurchaseCompletedListener((orderId, sku) => {
        purchaseCompletedListenerRef.current?.(orderId, sku);
      });

    const purchaseFailedSubscription = GfmcReact.addPurchaseFailedListener(
      (reason) => {
        purchaseFailedListenerRef.current?.(reason);
      }
    );

    return () => {
      tokenRefreshSubscription.remove();
      skuSelectedSubscription.remove();
      hubReadySubscription.remove();
      hubClosedSubscription.remove();
      shareRequestedSubscription.remove();
      errorSubscription.remove();
      moduleChangedSubscription.remove();
      purchaseCompletedSubscription.remove();
      purchaseFailedSubscription.remove();
    };
  }, []);

  const init = useCallback(
    async (env: GfmcEnv = GfmcEnv.SANDBOX, enableLogging = false) => {
      try {
        await GfmcReact.init(env, enableLogging);
        const currentVersion = await GfmcReact.getVersion();
        setVersion(currentVersion);
      } catch (error) {
        setLastError({
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Failed to init',
        });
        throw error;
      }
    },
    []
  );

  const open = useCallback(async (jwt: string) => {
    try {
      await GfmcReact.open(jwt);
    } catch (error) {
      setLastError({
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Failed to open',
      });
      throw error;
    }
  }, []);

  const setTokenRefresher = useCallback((callback: () => Promise<string>) => {
    tokenRefresherRef.current = callback;
  }, []);

  const setSkuListener = useCallback((callback: (sku: string) => void) => {
    skuListenerRef.current = callback;
  }, []);

  const setHubReadyListener = useCallback((callback: () => void) => {
    hubReadyListenerRef.current = callback;
  }, []);

  const setHubClosedListener = useCallback((callback: () => void) => {
    hubClosedListenerRef.current = callback;
  }, []);

  const setPurchaseCompletedListener = useCallback(
    (callback: (orderId: string, sku: string) => void) => {
      purchaseCompletedListenerRef.current = callback;
    },
    []
  );

  const setPurchaseFailedListener = useCallback(
    (callback: (reason: string) => void) => {
      purchaseFailedListenerRef.current = callback;
    },
    []
  );

  const setModuleChangedListener = useCallback(
    (callback: (module: GfmcModuleName) => void) => {
      moduleChangedListenerRef.current = callback;
    },
    []
  );

  const setShareRequestedListener = useCallback(
    (callback: (title: string, url: string) => void) => {
      shareRequestedListenerRef.current = callback;
    },
    []
  );

  return {
    init,
    open,
    version,
    setTokenRefresher,
    setSkuListener,
    setHubReadyListener,
    setHubClosedListener,
    setPurchaseCompletedListener,
    setPurchaseFailedListener,
    setModuleChangedListener,
    setShareRequestedListener,
    lastError,
  };
}
