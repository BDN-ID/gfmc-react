import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { NativeEventEmitter } from 'react-native';
import { GfmcEnv, useGfmcSdk } from '../index';

// `NativeGfmcReact` di-mock penuh (bukan `NativeModules`/`TurboModuleRegistry`) supaya
// tidak bergantung pada codegen native yang sesungguhnya tidak ada di lingkungan test.
const mockInit = jest
  .fn<(env?: string, enableLogging?: boolean) => Promise<void>>()
  .mockResolvedValue(undefined);
const mockOpen = jest
  .fn<(jwt: string) => Promise<void>>()
  .mockResolvedValue(undefined);
const mockGetVersion = jest
  .fn<() => Promise<string>>()
  .mockResolvedValue('2.3.9');
const mockSubmitTokenRefresh =
  jest.fn<(requestId: string, jwt: string) => void>();
const mockFailTokenRefresh =
  jest.fn<(requestId: string, message: string) => void>();

// Event native (mis. `onTokenRefreshRequested`) disimulasikan lewat `NativeEventEmitter.emit`,
// yang di React Native selalu forward ke `RCTDeviceEventEmitter` global — persis mekanisme
// yang dipakai `useGfmcSdk()` lewat `gfmcEventEmitter` di `src/index.tsx`. Instance di sini
// tidak perlu native module yang sama, cukup implementasi `addListener`/`removeListeners`
// supaya tidak memicu warning dari `NativeEventEmitter`.
const testEventEmitter = new NativeEventEmitter({
  addListener: jest.fn(),
  removeListeners: jest.fn(),
});

jest.mock('../NativeGfmcReact', () => ({
  __esModule: true,
  default: {
    configure: (env?: string, enableLogging?: boolean) =>
      mockInit(env, enableLogging),
    open: (jwt: string) => mockOpen(jwt),
    getVersion: () => mockGetVersion(),
    submitTokenRefresh: (requestId: string, jwt: string) =>
      mockSubmitTokenRefresh(requestId, jwt),
    failTokenRefresh: (requestId: string, message: string) =>
      mockFailTokenRefresh(requestId, message),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
}));

function flushMicrotasks() {
  return act(() => Promise.resolve());
}

// `useGfmcSdk()` subscribe ke `RCTDeviceEventEmitter` singleton lewat `useEffect`. Kalau
// renderer dari test sebelumnya tidak di-unmount, subscription-nya tetap aktif dan ikut
// menerima event yang di-emit test berikutnya (kebocoran antar-test). Semua renderer yang
// dibuat lewat `renderHook` di bawah didaftarkan di sini supaya `afterEach` bisa unmount semua.
const activeRenderers: TestRenderer.ReactTestRenderer[] = [];

afterEach(() => {
  act(() => {
    activeRenderers.forEach((renderer) => renderer.unmount());
  });
  activeRenderers.length = 0;
});

/**
 * Implementasi minimal ala `@testing-library/react-native`'s `renderHook`, dibangun di atas
 * `react-test-renderer` (satu-satunya renderer test yang dipasang di project ini) supaya tidak
 * perlu menambah dependency baru. `result.current` selalu merefleksikan nilai hook terbaru
 * lewat getter, sama seperti versi aslinya.
 */
function renderHook<T>(hook: () => T) {
  let value: T;

  function TestComponent() {
    value = hook();
    return null;
  }

  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<TestComponent />);
  });
  activeRenderers.push(renderer!);

  return {
    result: {
      get current(): T {
        return value;
      },
    },
    unmount: () => act(() => renderer.unmount()),
  };
}

describe('useGfmcSdk', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('init() sukses menyimpan version dari native (getVersion)', async () => {
    const { result } = renderHook(() => useGfmcSdk());

    await act(async () => {
      await result.current.init(GfmcEnv.SANDBOX, true);
    });

    expect(mockInit).toHaveBeenCalledWith(GfmcEnv.SANDBOX, true);
    expect(mockGetVersion).toHaveBeenCalled();
    expect(result.current.version).toBe('2.3.9');
    expect(result.current.lastError).toBeNull();
  });

  it('init() gagal set lastError dan reject', async () => {
    mockInit.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useGfmcSdk());

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.init();
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('boom');
    expect(result.current.lastError).toEqual({
      code: 'NETWORK_ERROR',
      message: 'boom',
    });
  });

  it('open() sukses resolve tanpa error', async () => {
    const { result } = renderHook(() => useGfmcSdk());

    await act(async () => {
      await result.current.open('jwt-token');
    });

    expect(mockOpen).toHaveBeenCalledWith('jwt-token');
    expect(result.current.lastError).toBeNull();
  });

  it('open() gagal set lastError dan reject', async () => {
    mockOpen.mockRejectedValueOnce(new Error('network down'));
    const { result } = renderHook(() => useGfmcSdk());

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.open('jwt-token');
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('network down');
    expect(result.current.lastError).toEqual({
      code: 'NETWORK_ERROR',
      message: 'network down',
    });
  });

  it('event onTokenRefreshRequested memanggil tokenRefresherRef lalu submitTokenRefresh saat sukses', async () => {
    const { result } = renderHook(() => useGfmcSdk());

    act(() => {
      result.current.setTokenRefresher(() => Promise.resolve('fresh-jwt'));
    });

    act(() => {
      testEventEmitter.emit('onTokenRefreshRequested', {
        requestId: 'req-1',
      });
    });

    await flushMicrotasks();

    expect(mockSubmitTokenRefresh).toHaveBeenCalledWith('req-1', 'fresh-jwt');
    expect(mockFailTokenRefresh).not.toHaveBeenCalled();
  });

  it('event onTokenRefreshRequested memanggil failTokenRefresh saat refresher reject', async () => {
    const { result } = renderHook(() => useGfmcSdk());

    act(() => {
      result.current.setTokenRefresher(() =>
        Promise.reject(new Error('refresh gagal'))
      );
    });

    act(() => {
      testEventEmitter.emit('onTokenRefreshRequested', {
        requestId: 'req-2',
      });
    });

    await flushMicrotasks();

    expect(mockFailTokenRefresh).toHaveBeenCalledWith('req-2', 'refresh gagal');
    expect(mockSubmitTokenRefresh).not.toHaveBeenCalled();
    expect(result.current.lastError).toEqual({
      code: 'NETWORK_ERROR',
      message: 'refresh gagal',
    });
  });

  it('event onSkuSelected memicu callback setSkuListener', () => {
    const { result } = renderHook(() => useGfmcSdk());
    const onSku = jest.fn();

    act(() => {
      result.current.setSkuListener(onSku);
    });

    act(() => {
      testEventEmitter.emit('onSkuSelected', { sku: 'sku-123' });
    });

    expect(onSku).toHaveBeenCalledWith('sku-123');
  });

  it('event onError mengisi state lastError', () => {
    const { result } = renderHook(() => useGfmcSdk());

    act(() => {
      testEventEmitter.emit('onError', {
        code: 'WEBVIEW_OUTDATED',
        message: 'WebView terlalu lama',
      });
    });

    expect(result.current.lastError).toEqual({
      code: 'WEBVIEW_OUTDATED',
      message: 'WebView terlalu lama',
    });
  });

  it('event lifecycle & purchase memicu listener yang sesuai', () => {
    const { result } = renderHook(() => useGfmcSdk());
    const onHubReady = jest.fn();
    const onHubClosed = jest.fn();
    const onPurchaseCompleted = jest.fn();
    const onPurchaseFailed = jest.fn();
    const onModuleChanged = jest.fn();
    const onShareRequested = jest.fn();

    act(() => {
      result.current.setHubReadyListener(onHubReady);
      result.current.setHubClosedListener(onHubClosed);
      result.current.setPurchaseCompletedListener(onPurchaseCompleted);
      result.current.setPurchaseFailedListener(onPurchaseFailed);
      result.current.setModuleChangedListener(onModuleChanged);
      result.current.setShareRequestedListener(onShareRequested);
    });

    act(() => {
      testEventEmitter.emit('onHubReady', {});
      testEventEmitter.emit('onHubClosed', {});
      testEventEmitter.emit('onPurchaseCompleted', {
        orderId: 'order-1',
        sku: 'sku-1',
      });
      testEventEmitter.emit('onPurchaseFailed', { reason: 'declined' });
      testEventEmitter.emit('onModuleChanged', { module: 'GAME' });
      testEventEmitter.emit('onShareRequested', {
        title: 'Judul',
        url: 'https://example.com',
      });
    });

    expect(onHubReady).toHaveBeenCalledTimes(1);
    expect(onHubClosed).toHaveBeenCalledTimes(1);
    expect(onPurchaseCompleted).toHaveBeenCalledWith('order-1', 'sku-1');
    expect(onPurchaseFailed).toHaveBeenCalledWith('declined');
    expect(onModuleChanged).toHaveBeenCalledWith('GAME');
    expect(onShareRequested).toHaveBeenCalledWith(
      'Judul',
      'https://example.com'
    );
  });
});
