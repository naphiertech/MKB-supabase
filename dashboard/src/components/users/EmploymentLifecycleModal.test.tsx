// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppUser } from '../../services/types';
import { EmploymentLifecycleModal } from './EmploymentLifecycleModal';

const rider: AppUser = {
  id: 'user-1',
  riderId: 'rider-1',
  name: 'Rider One',
  email: 'rider@example.test',
  avatar: '',
  role: 'rider',
  zoneId: 'zone-1',
  status: 'active',
  employmentStatus: 'active',
  lastLogin: 0,
};

describe('employment lifecycle modal', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  function renderModal(overrides: Partial<ComponentProps<typeof EmploymentLifecycleModal>> = {}) {
    const onArchive = vi.fn().mockResolvedValue(undefined);
    const onRestore = vi.fn().mockResolvedValue(undefined);
    act(() => root.render(
      <EmploymentLifecycleModal
        open
        mode="archive"
        user={rider}
        today="2026-08-11"
        onClose={vi.fn()}
        onArchive={onArchive}
        onRestore={onRestore}
        {...overrides}
      />,
    ));
    return { onArchive, onRestore };
  }

  it('requires remarks for Other and submits the validated archive fields', async () => {
    const { onArchive } = renderModal();
    const reason = document.querySelector<HTMLSelectElement>('#archive-reason')!;
    act(() => {
      reason.value = 'Other';
      reason.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const submit = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('Archive Employee'))!;
    await act(async () => { submit.click(); });
    expect(document.body.textContent).toContain('Remarks are required');
    expect(onArchive).not.toHaveBeenCalled();

    const remarks = document.querySelector<HTMLTextAreaElement>('#archive-remarks')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(remarks, 'Documented separation.');
      remarks.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { submit.click(); });
    expect(onArchive).toHaveBeenCalledWith({
      reason: 'Other',
      effectiveDate: '2026-08-11',
      remarks: 'Documented separation.',
    });
  });

  it('blocks Archive when an open attendance session exists', () => {
    const { onArchive } = renderModal({ hasOpenAttendance: true });
    expect(document.body.textContent).toContain('Resolve the attendance record before archiving');
    const submit = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('Archive Employee'))!;
    expect(submit.disabled).toBe(true);
    expect(onArchive).not.toHaveBeenCalled();
  });

  it('explains that Restore keeps account access suspended', () => {
    renderModal({ mode: 'restore', user: { ...rider, employmentStatus: 'archived', status: 'suspended' } });
    expect(document.body.textContent).toContain('keeps the account suspended');
    expect(document.body.textContent).toContain('explicitly reactivate account access');
  });
});
