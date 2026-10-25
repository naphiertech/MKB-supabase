import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

/**
 * Checks whether the current runtime environment is a native mobile shell (Android/iOS).
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Gets the current Capacitor platform ('android' | 'ios' | 'web').
 */
export function getNativePlatform(): string {
  return Capacitor.getPlatform();
}

/**
 * Initializes native mobile window, status bar, splash screen, and hardware listeners.
 */
export async function initializeNativeShell(options: {
  onHardwareBack?: () => boolean | void;
}): Promise<() => void> {
  if (!isNativePlatform()) {
    return () => undefined;
  }

  try {
    // 1. Configure Status Bar
    await Promise.resolve(StatusBar.setStyle({ style: Style.Light })).catch(() => undefined);
    await Promise.resolve(StatusBar.setBackgroundColor({ color: '#ffffff' })).catch(() => undefined);

    // 2. Hide splash screen after initialization
    await Promise.resolve(SplashScreen.hide()).catch(() => undefined);
  } catch (err) {
    console.warn('[NativeShell] Failed to configure native window chrome:', err);
  }

  // 3. Register hardware back button listener
  let backListenerRemove: (() => Promise<void>) | null = null;
  try {
    const handle = await CapApp.addListener('backButton', ({ canGoBack }) => {
      // If consumer custom handler returns true (e.g. handled drawer or modal close), prevent default
      if (options.onHardwareBack && options.onHardwareBack()) {
        return;
      }

      if (canGoBack) {
        window.history.back();
      } else {
        void CapApp.exitApp();
      }
    });
    backListenerRemove = () => handle.remove();
  } catch (err) {
    console.warn('[NativeShell] Failed to bind hardware back button:', err);
  }

  return () => {
    if (backListenerRemove) {
      void backListenerRemove();
    }
  };
}
