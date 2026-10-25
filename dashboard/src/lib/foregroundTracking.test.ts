import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Capacitor } from '@capacitor/core';
import {
  startForegroundDutyTracking,
  stopForegroundDutyTracking,
  isForegroundDutyTracking,
  subscribeToForegroundLocation,
} from './foregroundTracking';

const { mockPlugin } = vi.hoisted(() => ({
  mockPlugin: {
    startTracking: vi.fn(),
    stopTracking: vi.fn(),
    isTracking: vi.fn(),
    addListener: vi.fn(),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
    getPlatform: vi.fn(),
  },
  registerPlugin: vi.fn(() => mockPlugin),
}));

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'mock-token' } },
      }),
    },
  },
}));

describe('foregroundTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('on Web / Non-Android platform', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
    });

    it('gracefully no-ops without calling native plugin', async () => {
      expect(await startForegroundDutyTracking({ riderId: 'r-1' })).toBe(false);
      expect(await stopForegroundDutyTracking()).toBe(false);
      expect(await isForegroundDutyTracking()).toBe(false);

      const cleanup = await subscribeToForegroundLocation(() => undefined);
      cleanup();

      expect(mockPlugin.startTracking).not.toHaveBeenCalled();
      expect(mockPlugin.stopTracking).not.toHaveBeenCalled();
    });
  });

  describe('on Native Android platform', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
      mockPlugin.startTracking.mockResolvedValue({ status: 'started' });
      mockPlugin.stopTracking.mockResolvedValue({ status: 'stopped' });
      mockPlugin.isTracking.mockResolvedValue({ active: true });
    });

    it('starts foreground service with credentials and rider details', async () => {
      const ok = await startForegroundDutyTracking({
        riderId: 'rider-123',
        hubName: 'Downtown Hub',
      });
      expect(ok).toBe(true);
      expect(mockPlugin.startTracking).toHaveBeenCalledWith(
        expect.objectContaining({
          riderId: 'rider-123',
          hubName: 'Downtown Hub',
          authToken: 'mock-token',
        })
      );
    });

    it('stops foreground tracking service cleanly', async () => {
      const ok = await stopForegroundDutyTracking();
      expect(ok).toBe(true);
      expect(mockPlugin.stopTracking).toHaveBeenCalled();
    });

    it('checks active tracking status', async () => {
      const active = await isForegroundDutyTracking();
      expect(active).toBe(true);
      expect(mockPlugin.isTracking).toHaveBeenCalled();
    });

    it('subscribes to native location events and provides cleanup handle', async () => {
      const removeMock = vi.fn();
      mockPlugin.addListener.mockResolvedValue({ remove: removeMock });

      const callback = vi.fn();
      const unsubscribe = await subscribeToForegroundLocation(callback);

      expect(mockPlugin.addListener).toHaveBeenCalledWith('onLocationUpdate', callback);
      unsubscribe();
      expect(removeMock).toHaveBeenCalled();
    });
  });
});
