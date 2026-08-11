// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBiometricPreloadPriority,
  scheduleBiometricPreload,
} from './biometricPreloadScheduler';

describe('mobile-friendly biometric preload scheduling', () => {
  const idleCallbacks: IdleRequestCallback[] = [];
  const requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
    idleCallbacks.push(callback);
    return idleCallbacks.length;
  });
  const cancelIdleCallback = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    idleCallbacks.length = 0;
    requestIdleCallback.mockClear();
    cancelIdleCallback.mockClear();
    Object.defineProperties(window, {
      requestIdleCallback: { configurable: true, value: requestIdleCallback },
      cancelIdleCallback: { configurable: true, value: cancelIdleCallback },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'requestIdleCallback');
    Reflect.deleteProperty(window, 'cancelIdleCallback');
  });

  it('waits for the initial delay and genuine idle time before starting', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const cancel = scheduleBiometricPreload(task, { initialDelayMs: 1500, quietPeriodMs: 1000 });

    await vi.advanceTimersByTimeAsync(1499);
    expect(requestIdleCallback).not.toHaveBeenCalled();
    expect(task).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(task).not.toHaveBeenCalled();

    idleCallbacks[0]({ didTimeout: false, timeRemaining: () => 20 });
    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(1);
    cancel();
  });

  it('postpones pending preload when the rider interacts with the dashboard', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const cancel = scheduleBiometricPreload(task, { initialDelayMs: 1500, quietPeriodMs: 1000 });

    await vi.advanceTimersByTimeAsync(1500);
    window.dispatchEvent(new Event('pointerdown'));

    expect(cancelIdleCallback).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(requestIdleCallback).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(requestIdleCallback).toHaveBeenCalledTimes(2);
    idleCallbacks[1]({ didTimeout: false, timeRemaining: () => 20 });
    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(1);
    cancel();
  });

  it('lets a foreground Time In or Time Out request stop optional background stages', () => {
    const priority = createBiometricPreloadPriority();

    expect(priority.canContinueBackground()).toBe(true);
    priority.requestForeground();
    expect(priority.canContinueBackground()).toBe(false);
  });
});
