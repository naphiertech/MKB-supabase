import { registerPlugin, Capacitor } from '@capacitor/core';

export interface DeviceSecurityCheckResult {
  isDevelopmentSettingsEnabled: boolean;
  isAdbEnabled: boolean;
  isDebugBuild: boolean;
  isRooted?: boolean;
  detectedMockApps?: string[];
  blocked: boolean;
}

export interface HardwareDeviceInfo {
  androidId: string;
  manufacturer: string;
  model: string;
  sdkInt: number;
}

export interface BatteryOptimizationResult {
  isIgnoringBatteryOptimizations: boolean;
}

interface DeviceSecurityPluginInterface {
  checkSecurity(): Promise<DeviceSecurityCheckResult>;
  openDeveloperSettings(): Promise<{ success: boolean }>;
  getHardwareDeviceInfo(): Promise<HardwareDeviceInfo>;
  checkBatteryOptimization(): Promise<BatteryOptimizationResult>;
  requestIgnoreBatteryOptimization(): Promise<{ success: boolean }>;
}

const DeviceSecurity = registerPlugin<DeviceSecurityPluginInterface>('DeviceSecurity');

export async function checkDeviceSecurity(): Promise<DeviceSecurityCheckResult> {
  if (!Capacitor.isNativePlatform()) {
    return {
      isDevelopmentSettingsEnabled: false,
      isAdbEnabled: false,
      isDebugBuild: false,
      isRooted: false,
      detectedMockApps: [],
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
      isRooted: false,
      detectedMockApps: [],
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

export async function getHardwareDeviceInfo(): Promise<HardwareDeviceInfo | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const info = await DeviceSecurity.getHardwareDeviceInfo();
    if (!info?.androidId) return null;
    return info;
  } catch (err) {
    console.warn('[DeviceSecurity] Failed to read hardware device info:', err);
    return null;
  }
}

export async function checkBatteryOptimization(): Promise<BatteryOptimizationResult> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return { isIgnoringBatteryOptimizations: true };
  }
  try {
    return await DeviceSecurity.checkBatteryOptimization();
  } catch (err) {
    console.warn('[DeviceSecurity] Failed to check battery optimization:', err);
    return { isIgnoringBatteryOptimizations: true };
  }
}

export async function requestIgnoreBatteryOptimization(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return false;
  try {
    const res = await DeviceSecurity.requestIgnoreBatteryOptimization();
    return !!res?.success;
  } catch (err) {
    console.warn('[DeviceSecurity] Failed to request battery optimization exemption:', err);
    return false;
  }
}
