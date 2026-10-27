// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { checkDeviceSecurity, openDeveloperSettings } from './deviceSecurity';

const mockPlugin = vi.hoisted(() => ({
  checkSecurity: vi.fn(),
  openDeveloperSettings: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
  registerPlugin: vi.fn(() => mockPlugin),
}));

import { Capacitor } from '@capacitor/core';

describe('deviceSecurity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns unblocked default when running on web (non-native platform)', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    const result = await checkDeviceSecurity();
    expect(result).toEqual({
      isDevelopmentSettingsEnabled: false,
      isAdbEnabled: false,
      isDebugBuild: false,
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
      blocked: true,
    });

    const result = await checkDeviceSecurity();
    expect(mockPlugin.checkSecurity).toHaveBeenCalled();
    expect(result.blocked).toBe(true);
    expect(result.isDevelopmentSettingsEnabled).toBe(true);
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
});
