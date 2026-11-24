// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  checkBatteryOptimization,
  checkDeviceSecurity,
  getHardwareDeviceInfo,
  openDeveloperSettings,
  requestIgnoreBatteryOptimization,
} from './deviceSecurity';

const mockPlugin = vi.hoisted(() => ({
  checkSecurity: vi.fn(),
  openDeveloperSettings: vi.fn(),
  getHardwareDeviceInfo: vi.fn(),
  checkBatteryOptimization: vi.fn(),
  requestIgnoreBatteryOptimization: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
    getPlatform: vi.fn(),
  },
  registerPlugin: vi.fn(() => mockPlugin),
}));

import { Capacitor } from '@capacitor/core';

describe('deviceSecurity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
  });

  it('returns unblocked default when running on web (non-native platform)', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    const result = await checkDeviceSecurity();
    expect(result).toEqual({
      isDevelopmentSettingsEnabled: false,
      isAdbEnabled: false,
      isDebugBuild: false,
      isRooted: false,
      detectedMockApps: [],
      blocked: false,
    });
    expect(mockPlugin.checkSecurity).not.toHaveBeenCalled();
  });

  it('queries native DeviceSecurity plugin when running on native platform', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    mockPlugin.checkSecurity.mockResolvedValue({
      isDevelopmentSettingsEnabled: true,
      isAdbEnabled: true,
      isDebugBuild: false,
      isRooted: false,
      detectedMockApps: ['com.lexa.fakegps'],
      blocked: true,
    });

    const result = await checkDeviceSecurity();
    expect(mockPlugin.checkSecurity).toHaveBeenCalled();
    expect(result.blocked).toBe(true);
    expect(result.isDevelopmentSettingsEnabled).toBe(true);
    expect(result.detectedMockApps).toEqual(['com.lexa.fakegps']);
  });

  it('handles openDeveloperSettings call on native platform', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    mockPlugin.openDeveloperSettings.mockResolvedValue({ success: true });

    const opened = await openDeveloperSettings();
    expect(mockPlugin.openDeveloperSettings).toHaveBeenCalled();
    expect(opened).toBe(true);
  });

  it('returns false for openDeveloperSettings on non-native platform', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    const opened = await openDeveloperSettings();
    expect(mockPlugin.openDeveloperSettings).not.toHaveBeenCalled();
    expect(opened).toBe(false);
  });

  it('returns hardware device info with ANDROID_ID on native platform', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    mockPlugin.getHardwareDeviceInfo.mockResolvedValue({
      androidId: '9774d56d682e549c',
      manufacturer: 'Xiaomi',
      model: 'Redmi Note 13',
      sdkInt: 34,
    });

    const info = await getHardwareDeviceInfo();
    expect(info).toEqual({
      androidId: '9774d56d682e549c',
      manufacturer: 'Xiaomi',
      model: 'Redmi Note 13',
      sdkInt: 34,
    });
  });

  it('checks and requests battery optimization exemption on native Android', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    mockPlugin.checkBatteryOptimization.mockResolvedValue({ isIgnoringBatteryOptimizations: false });
    mockPlugin.requestIgnoreBatteryOptimization.mockResolvedValue({ success: true });

    const status = await checkBatteryOptimization();
    expect(status.isIgnoringBatteryOptimizations).toBe(false);

    const requested = await requestIgnoreBatteryOptimization();
    expect(requested).toBe(true);
  });
});
