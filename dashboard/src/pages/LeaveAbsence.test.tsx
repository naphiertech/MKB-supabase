// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isOnline: true,
  currentWindow: vi.fn(),
  windowForDate: vi.fn(),
  shiftWindow: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  review: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('../context/HubContext', () => ({ useHub: () => ({ selectedHubId: 'hub-1' }) }));
vi.mock('../hooks/useNetworkStatus', () => ({ useNetworkStatus: () => mocks.isOnline }));
vi.mock('../services/workforce/riderAbsenceRequestService', async () => {
  const actual = await vi.importActual<typeof import('../services/workforce/riderAbsenceRequestService')>('../services/workforce/riderAbsenceRequestService');
  return {
    ...actual,
    getCurrentRiderAbsenceWindow: mocks.currentWindow,
    getRiderAbsenceWindowForDate: mocks.windowForDate,
    shiftRiderAbsenceWindow: mocks.shiftWindow,
    listRiderAbsenceRequests: mocks.list,
    getRiderAbsenceRequestDetail: mocks.detail,
    reviewRiderAbsenceRequest: mocks.review,
    cancelApprovedRiderAbsenceRequest: mocks.cancel,
  };
});

import { LeaveAbsence } from './LeaveAbsence';

const pendingRequest = {
  id: 'request-1', riderId: 'rider-1', riderName: 'Juan Dela Cruz', riderMkbId: 'MKB-1',
  requestKind: 'planned_leave' as const, startDate: '2026-09-10', endDate: '2026-09-11', hubId: 'hub-1', hubName: 'Main Hub',
  reason: 'Personal appointment', submittedBy: 'user-1', submittedByName: 'Juan Dela Cruz', submittedAt: '2026-09-07T00:00:00Z',
  status: 'pending' as const, revision: 1, reviewedBy: null, reviewerName: null, reviewedAt: null, reviewReason: null,
  withdrawnBy: null, withdrawnAt: null, withdrawalReason: null, cancelledBy: null, cancelledAt: null, cancellationReason: null,
  createdAt: '2026-09-07T00:00:00Z', updatedAt: '2026-09-07T00:00:00Z', updatedBy: 'user-1',
};

const futureRequest = { ...pendingRequest, id: 'request-future', startDate: '2027-03-05', endDate: '2027-03-06' };
const olderRequest = { ...pendingRequest, id: 'request-older', startDate: '2026-08-10', endDate: '2026-08-11' };

async function flushEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setElementValue(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('LeaveAbsence', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.isOnline = true;
    mocks.currentWindow.mockReturnValue({ fromDate: '2026-09-01', toDate: '2026-09-30' });
    mocks.windowForDate.mockImplementation((date: string) => {
      if (date.startsWith('2027-03')) return { fromDate: '2027-03-01', toDate: '2027-03-31' };
      if (date.startsWith('2026-08')) return { fromDate: '2026-08-01', toDate: '2026-08-31' };
      return { fromDate: '2026-09-01', toDate: '2026-09-30' };
    });
    mocks.shiftWindow.mockImplementation((fromDate: string, amount: number) => ({
      fromDate: amount > 0 ? '2027-03-01' : fromDate === '2026-09-01' ? '2026-08-01' : '2026-09-01',
      toDate: amount > 0 ? '2027-03-31' : fromDate === '2026-09-01' ? '2026-08-31' : '2026-09-30',
    }));
    mocks.list.mockResolvedValue([pendingRequest]);
    mocks.detail.mockResolvedValue({ request: {}, audit: [{ id: 'audit-1', action: 'submitted', revision: 1, reason: 'Personal appointment', created_at: '2026-09-07T00:00:00Z', actor_name: 'Juan Dela Cruz' }] });
    mocks.review.mockResolvedValue('request-1');
    mocks.cancel.mockResolvedValue('request-1');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.querySelectorAll('[role="dialog"]').forEach((node) => node.remove());
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('shows the scoped pending queue and records an approval through the revisioned service', async () => {
    await act(async () => {
      root.render(<LeaveAbsence />);
    });
    await flushEffects();

    expect(container.textContent).toContain('Leave & Absence');
    expect(container.textContent).toContain('Juan Dela Cruz');
    expect(container.textContent).toContain('Pending');
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ hubId: 'hub-1', status: 'pending' }));

    const reviewButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Review');
    expect(reviewButton).toBeDefined();
    await act(async () => {
      reviewButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Private reason');
    const reason = dialog?.querySelector('textarea') as HTMLTextAreaElement;
    act(() => setElementValue(reason, 'Coverage approved'));
    const approveButton = Array.from(dialog?.querySelectorAll('button') ?? []).find((button) => button.textContent?.includes('Approve'));
    await act(async () => {
      approveButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.review).toHaveBeenCalledWith('request-1', 1, 'approved', 'Coverage approved');
  });

  it('navigates to older and far-future staff request windows', async () => {
    mocks.list.mockImplementation(async ({ fromDate }: { fromDate: string }) => {
      if (fromDate === '2027-03-01') return [futureRequest];
      if (fromDate === '2026-08-01') return [olderRequest];
      return [];
    });

    await act(async () => {
      root.render(<LeaveAbsence />);
    });
    await flushEffects();
    expect(container.textContent).toContain('Displayed range: Sep 1, 2026 – Sep 30, 2026');

    const next = Array.from(container.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === 'Next date range');
    await act(async () => {
      next?.click();
      await flushEffects();
    });
    expect(container.textContent).toContain('Displayed range: Mar 1, 2027 – Mar 31, 2027');
    expect(container.textContent).toContain('Mar 5, 2027');

    const findPrevious = () => Array.from(container.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === 'Previous date range');
    await act(async () => {
      findPrevious()?.click();
      await flushEffects();
    });
    expect(container.textContent).toContain('Displayed range: Sep 1, 2026 – Sep 30, 2026');
    await act(async () => {
      findPrevious()?.click();
      await flushEffects();
    });
    expect(container.textContent).toContain('Displayed range: Aug 1, 2026 – Aug 31, 2026');
    expect(container.textContent).toContain('Aug 10, 2026');
  });
});
