// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRiderSignOut } from './useRiderSignOut';
import * as attendanceCheck from '../services/riders/riderAttendanceCheck';

vi.mock('../services/riders/riderAttendanceCheck', () => ({
  checkHasActiveAttendance: vi.fn(),
}));

describe('useRiderSignOut hook', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.style.overflow = '';
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  function TestHarness({
    riderId,
    userId,
    onSignOut,
  }: {
    riderId?: string;
    userId?: string;
    onSignOut: () => void;
  }) {
    const { requestSignOut, warningModal } = useRiderSignOut({
      riderId,
      userId,
      onSignOut,
    });

    return (
      <div>
        <button type="button" onClick={requestSignOut} data-testid="signout-trigger">
          Trigger Sign Out
        </button>
        {warningModal}
      </div>
    );
  }

  it('immediately executes onSignOut when rider has no active shift', async () => {
    vi.mocked(attendanceCheck.checkHasActiveAttendance).mockResolvedValue(false);
    const mockSignOut = vi.fn();

    await act(async () => {
      root.render(<TestHarness riderId="rider-1" userId="user-1" onSignOut={mockSignOut} />);
    });

    const trigger = container.querySelector('[data-testid="signout-trigger"]') as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });

    expect(attendanceCheck.checkHasActiveAttendance).toHaveBeenCalledWith('rider-1', 'user-1');
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows warning modal and does not immediately sign out when active shift is detected', async () => {
    vi.mocked(attendanceCheck.checkHasActiveAttendance).mockResolvedValue(true);
    const mockSignOut = vi.fn();

    await act(async () => {
      root.render(<TestHarness riderId="rider-1" userId="user-1" onSignOut={mockSignOut} />);
    });

    const trigger = container.querySelector('[data-testid="signout-trigger"]') as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });

    expect(mockSignOut).not.toHaveBeenCalled();
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('You still have an active shift');
    expect(dialog?.textContent).toContain('Signing out will not end your attendance session');
  });

  it('dismisses modal on Cancel click without calling onSignOut', async () => {
    vi.mocked(attendanceCheck.checkHasActiveAttendance).mockResolvedValue(true);
    const mockSignOut = vi.fn();

    await act(async () => {
      root.render(<TestHarness riderId="rider-1" userId="user-1" onSignOut={mockSignOut} />);
    });

    const trigger = container.querySelector('[data-testid="signout-trigger"]') as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });

    const cancelButton = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Cancel')
    );
    expect(cancelButton).toBeDefined();

    await act(async () => {
      cancelButton?.click();
    });

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('calls onSignOut when clicking "Sign out anyway" in warning modal', async () => {
    vi.mocked(attendanceCheck.checkHasActiveAttendance).mockResolvedValue(true);
    const mockSignOut = vi.fn();

    await act(async () => {
      root.render(<TestHarness riderId="rider-1" userId="user-1" onSignOut={mockSignOut} />);
    });

    const trigger = container.querySelector('[data-testid="signout-trigger"]') as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });

    const confirmButton = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Sign out anyway')
    );
    expect(confirmButton).toBeDefined();

    await act(async () => {
      confirmButton?.click();
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
