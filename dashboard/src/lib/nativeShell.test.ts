import { describe, it, expect, vi, beforeEach } from 'vitest';

const capMocks = vi.hoisted(() => ({
  isNative: false,
  platform: 'web',
  addListener: vi.fn(),
  setStyle: vi.fn(),
  setBackgroundColor: vi.fn(),
  hideSplash: vi.fn(),
  exitApp: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => capMocks.isNative,
    getPlatform: () => capMocks.platform,
  },
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: capMocks.addListener,
    exitApp: capMocks.exitApp,
  },
}));

vi.mock('@capacitor/status-bar', () => ({
  StatusBar: {
    setStyle: capMocks.setStyle,
    setBackgroundColor: capMocks.setBackgroundColor,
  },
  Style: { Light: 'LIGHT', Dark: 'DARK' },
}));

vi.mock('@capacitor/splash-screen', () => ({
  SplashScreen: {
    hide: capMocks.hideSplash,
  },
}));

import { isNativePlatform, getNativePlatform, initializeNativeShell } from './nativeShell';

describe('nativeShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capMocks.isNative = false;
    capMocks.platform = 'web';
  });

  it('detects web platform when Capacitor is not native', () => {
    expect(isNativePlatform()).toBe(false);
    expect(getNativePlatform()).toBe('web');
  });

  it('detects native platform when Capacitor is native', () => {
    capMocks.isNative = true;
    capMocks.platform = 'android';
    expect(isNativePlatform()).toBe(true);
    expect(getNativePlatform()).toBe('android');
  });

  it('initializes status bar and hides splash screen on native platform', async () => {
    capMocks.isNative = true;
    capMocks.platform = 'android';
    capMocks.addListener.mockResolvedValue({ remove: vi.fn() });

    const cleanup = await initializeNativeShell({});
    expect(capMocks.setStyle).toHaveBeenCalledWith({ style: 'LIGHT' });
    expect(capMocks.setBackgroundColor).toHaveBeenCalledWith({ color: '#ffffff' });
    expect(capMocks.hideSplash).toHaveBeenCalled();

    cleanup();
  });

  it('handles hardware back button through custom handler', async () => {
    capMocks.isNative = true;
    let registeredCallback: ((e: { canGoBack: boolean }) => void) | null = null;
    capMocks.addListener.mockImplementation((event: string, cb: any) => {
      if (event === 'backButton') registeredCallback = cb;
      return Promise.resolve({ remove: vi.fn() });
    });

    const onHardwareBack = vi.fn().mockReturnValue(true);
    await initializeNativeShell({ onHardwareBack });

    expect(registeredCallback).not.toBeNull();
    registeredCallback!({ canGoBack: true });

    expect(onHardwareBack).toHaveBeenCalled();
    expect(capMocks.exitApp).not.toHaveBeenCalled();
  });
});
