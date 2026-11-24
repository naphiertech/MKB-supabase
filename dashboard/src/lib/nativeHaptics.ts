import { Capacitor } from '@capacitor/core';
import { Haptics, NotificationType } from '@capacitor/haptics';

function isNative(): boolean {
  return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
}

export async function triggerSuccessHaptic(): Promise<void> {
  if (!isNative()) return;
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // Non-fatal on devices without vibrator
  }
}

export async function triggerWarningHaptic(): Promise<void> {
  if (!isNative()) return;
  try {
    await Haptics.notification({ type: NotificationType.Warning });
  } catch {
    // Non-fatal on devices without vibrator
  }
}

export async function triggerErrorHaptic(): Promise<void> {
  if (!isNative()) return;
  try {
    await Haptics.notification({ type: NotificationType.Error });
  } catch {
    // Non-fatal on devices without vibrator
  }
}
