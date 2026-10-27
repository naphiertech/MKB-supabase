import { registerPlugin, Capacitor } from '@capacitor/core';

export interface DeviceSecurityCheckResult {
  isDevelopmentSettingsEnabled: boolean;
  isAdbEnabled: boolean;
  isDebugBuild: boolean;
  blocked: boolean;
}

interface DeviceSecurityPluginInterface {
  checkSecurity(): Promise<DeviceSecurityCheckResult>;
  openDeveloperSettings(): Promise<{ success: boolean }>;
}

const DeviceSecurity = registerPlugin<DeviceSecurityPluginInterface>('DeviceSecurity');

export async function checkDeviceSecurity(): Promise<DeviceSecurityCheckResult> {
  if (!Capacitor.isNativePlatform()) {
    return {
      isDevelopmentSettingsEnabled: false,
      isAdbEnabled: false,
      isDebugBuild: false,
      blocked: false,
    };
  }

  try {
    return await DeviceSecurity.checkSecurity();
  } catch (err) {
    console.warn('[DeviceSecurity] Failed to check device security:', err);
    return {
      isDevelopmentSettingsEnabled: false,
      isAdbEnabled: false,
      isDebugBuild: false,
      blocked: false,
    };
  }
}

export async function openDeveloperSettings(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const res = await DeviceSecurity.openDeveloperSettings();
    return !!res?.success;
  } catch (err) {
    console.warn('[DeviceSecurity] Failed to open developer settings:', err);
    return false;
  }
}
