// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { playNotificationSound } from './notificationSound';

afterEach(() => vi.unstubAllGlobals());

describe('notification sound', () => {
  it('fails gracefully when Web Audio is unavailable', async () => {
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
    await expect(playNotificationSound()).resolves.toBe(false);
  });

  it('plays one short browser-local chime without an audio dependency', async () => {
    const start = vi.fn();
    const stop = vi.fn();
    const close = vi.fn().mockResolvedValue(undefined);
    const oscillator = {
      connect: vi.fn(),
      frequency: { setValueAtTime: vi.fn() },
      start,
      stop,
      onended: null as null | (() => void),
    };
    const gain = {
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    };
    class AudioContextMock {
      currentTime = 1;
      destination = {};
      state = 'running';
      createOscillator = vi.fn(() => oscillator);
      createGain = vi.fn(() => gain);
      close = close;
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: AudioContextMock });

    await expect(playNotificationSound()).resolves.toBe(true);
    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledWith(1.16);
    oscillator.onended?.();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
