import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  notification: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform,
  },
}));

vi.mock('@capacitor/haptics', () => ({
  NotificationType: {
    Success: 'SUCCESS',
    Warning: 'WARNING',
    Error: 'ERROR',
  },
  Haptics: {
    notification: mocks.notification,
  },
}));

import { triggerErrorHaptic, triggerSuccessHaptic, triggerWarningHaptic } from './nativeHaptics';

describe('nativeHaptics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no-ops safely on web', async () => {
    mocks.isNativePlatform.mockReturnValue(false);
    await triggerSuccessHaptic();
    await triggerWarningHaptic();
    await triggerErrorHaptic();
    expect(mocks.notification).not.toHaveBeenCalled();
  });

  it('triggers distinct native notification haptics on native platforms', async () => {
    mocks.isNativePlatform.mockReturnValue(true);
    await triggerSuccessHaptic();
    await triggerWarningHaptic();
    await triggerErrorHaptic();

    expect(mocks.notification).toHaveBeenNthCalledWith(1, { type: 'SUCCESS' });
    expect(mocks.notification).toHaveBeenNthCalledWith(2, { type: 'WARNING' });
    expect(mocks.notification).toHaveBeenNthCalledWith(3, { type: 'ERROR' });
  });
});
