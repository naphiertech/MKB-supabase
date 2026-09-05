// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isOnline: false,
  currentWindow: vi.fn(),
  windowForDate: vi.fn(),
  shiftWindow: vi.fn(),
  cached: vi.fn(),
  list: vi.fn(),
  setCached: vi.fn(),
  submitLeave: vi.fn(),
  submitNotice: vi.fn(),
  withdraw: vi.fn(),
}));

vi.mock('../hooks/useNetworkStatus', () => ({ useNetworkStatus: () => mocks.isOnline }));
vi.mock('../services/workforce/riderAbsenceRequestService', async () => {
  const actual = await vi.importActual<typeof import('../services/workforce/riderAbsenceRequestService')>('../services/workforce/riderAbsenceRequestService');
  return {
    ...actual,
    getCurrentRiderAbsenceWindow: mocks.currentWindow,
    getRiderAbsenceWindowForDate: mocks.windowForDate,
    shiftRiderAbsenceWindow: mocks.shiftWindow,
    getCachedRiderAbsenceRequests: mocks.cached,
    listRiderAbsenceRequests: mocks.list,
    setCachedRiderAbsenceRequests: mocks.setCached,
    submitPlannedLeave: mocks.submitLeave,
    submitAbsenceNotice: mocks.submitNotice,
    withdrawRiderAbsenceRequest: mocks.withdraw,
  };
});

import { RiderLeaveAbsence } from './RiderLeaveAbsence';

const cachedRequest = {
  id: 'request-1', riderId: 'rider-1', riderName: 'Juan Dela Cruz', riderMkbId: 'MKB-1',
  requestKind: 'planned_leave' as const, startDate: '2026-09-10', endDate: '2026-09-11',
  hubId: 'hub-1', hubName: 'Main Hub', reason: null, submittedBy: 'user-1', submittedByName: 'Juan Dela Cruz',
  submittedAt: '2026-09-07T00:00:00Z', status: 'pending' as const, revision: 1, reviewedBy: null, reviewerName: null,
  reviewedAt: null, reviewReason: null, withdrawnBy: null, withdrawnAt: null, withdrawalReason: null,
  cancelledBy: null, cancelledAt: null, cancellationReason: null, createdAt: '2026-09-07T00:00:00Z',
  updatedAt: '2026-09-07T00:00:00Z', updatedBy: 'user-1',
};

const futureRequest = { ...cachedRequest, id: 'request-future', startDate: '2026-10-10', endDate: '2026-10-11' };
const olderRequest = { ...cachedRequest, id: 'request-older', startDate: '2026-08-10', endDate: '2026-08-11' };
const farFutureRequest = { ...cachedRequest, id: 'request-far-future', startDate: '2027-03-05', endDate: '2027-03-06' };

async function flushEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setElementValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('RiderLeaveAbsence', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.isOnline = false;
    mocks.currentWindow.mockReturnValue({ fromDate: '2026-09-01', toDate: '2026-09-30' });
    mocks.windowForDate.mockImplementation((date: string) => {
      if (date.startsWith('2027-03')) return { fromDate: '2027-03-01', toDate: '2027-03-31' };
      if (date.startsWith('2026-10')) return { fromDate: '2026-10-01', toDate: '2026-10-31' };
      if (date.startsWith('2026-08')) return { fromDate: '2026-08-01', toDate: '2026-08-31' };
      return { fromDate: '2026-09-01', toDate: '2026-09-30' };
    });
    mocks.shiftWindow.mockImplementation((fromDate: string, amount: number) => ({
      fromDate: amount > 0 ? '2026-10-01' : fromDate === '2026-09-01' ? '2026-08-01' : '2026-09-01',
      toDate: amount > 0 ? '2026-10-31' : fromDate === '2026-09-01' ? '2026-08-31' : '2026-09-30',
    }));
    mocks.cached.mockResolvedValue({
      userId: 'user-1', riderId: 'rider-1', cacheVersion: 1, fromDate: '2026-09-01', toDate: '2026-09-30',
      requests: [cachedRequest], cachedAt: '2026-09-07T00:00:00Z',
    });
    mocks.list.mockResolvedValue([]);
    mocks.setCached.mockResolvedValue(undefined);
    mocks.submitLeave.mockResolvedValue('request-new');
    mocks.submitNotice.mockResolvedValue('notice-new');
    mocks.withdraw.mockResolvedValue('request-1');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.querySelectorAll('[role="dialog"]').forEach((node) => node.remove());
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('renders a private cached current request while offline and never queues a write', async () => {
    await act(async () => {
      root.render(<RiderLeaveAbsence userId="user-1" riderId="rider-1" />);
    });
    await flushEffects();

    expect(container.textContent).toContain('Leave & Absence');
    expect(container.textContent).toContain('Offline view');
    expect(container.textContent).toContain('Cached copy · may be stale');
    expect(container.textContent).toContain('Planned Leave');
    expect(container.textContent).toContain('Reason unavailable in offline cache.');
    expect(mocks.list).not.toHaveBeenCalled();
    const requestLeaveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Request Leave');
    act(() => requestLeaveButton?.click());
    const submitButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Submit Planned Leave'));
    expect(submitButton).toBeDefined();
    expect(submitButton).toHaveProperty('disabled', true);
  });

  it('navigates stable bounded windows and exposes older and far-future requests', async () => {
    mocks.isOnline = true;
    mocks.cached.mockResolvedValue(null);
    mocks.list.mockImplementation(async ({ fromDate }: { fromDate: string }) => {
      if (fromDate === '2026-10-01') return [futureRequest];
      if (fromDate === '2026-08-01') return [olderRequest];
      return [];
    });

    await act(async () => {
      root.render(<RiderLeaveAbsence userId="user-1" riderId="rider-1" />);
    });
    await flushEffects();
    expect(container.textContent).toContain('Displayed range: Sep 1, 2026 – Sep 30, 2026');

    const next = Array.from(container.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === 'Next date range');
    expect(next).toBeDefined();
    await act(async () => {
      next?.click();
      await flushEffects();
    });
    expect(container.textContent).toContain('Displayed range: Oct 1, 2026 – Oct 31, 2026');
    expect(container.textContent).toContain('Oct 10, 2026');

    const findPrevious = () => Array.from(container.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === 'Previous date range');
    await act(async () => {
      findPrevious()?.click();
      await flushEffects();
    });
    await act(async () => {
      findPrevious()?.click();
      await flushEffects();
    });
    expect(container.textContent).toContain('Displayed range: Aug 1, 2026 – Aug 31, 2026');
    expect(container.textContent).toContain('Aug 10, 2026');
  });

  it('moves to the request window after a successful submission outside the current range', async () => {
    mocks.isOnline = true;
    mocks.cached.mockResolvedValue(null);
    mocks.list.mockImplementation(async ({ fromDate }: { fromDate: string }) => fromDate === '2027-03-01' ? [farFutureRequest] : []);
    mocks.submitLeave.mockResolvedValue('request-far-future');

    await act(async () => {
      root.render(<RiderLeaveAbsence userId="user-1" riderId="rider-1" />);
    });
    await flushEffects();
    act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Request Leave')?.click());
    const dates = Array.from(container.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    const reason = container.querySelector('textarea') as HTMLTextAreaElement;
    act(() => {
      setElementValue(dates[0], '2027-03-05');
      setElementValue(dates[1], '2027-03-06');
      setElementValue(reason, 'Far future leave');
    });
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Submit Planned Leave'))?.click();
      await flushEffects();
      await flushEffects();
    });

    expect(mocks.submitLeave).toHaveBeenCalledWith(expect.objectContaining({ startDate: '2027-03-05', requestKey: expect.any(String) }));
    expect(container.textContent).toContain('Displayed range: Mar 1, 2027 – Mar 31, 2027');
    expect(container.textContent).toContain('Mar 5, 2027');
  });

  it('reuses the same request key when a submission response is uncertain', async () => {
    mocks.isOnline = true;
    mocks.cached.mockResolvedValue(null);
    mocks.list.mockResolvedValue([]);
    mocks.submitLeave.mockRejectedValueOnce(new Error('Network response lost')).mockResolvedValueOnce('request-new');

    await act(async () => {
      root.render(<RiderLeaveAbsence userId="user-1" riderId="rider-1" />);
    });
    await flushEffects();
    act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Request Leave')?.click());
    const reason = container.querySelector('textarea') as HTMLTextAreaElement;
    act(() => setElementValue(reason, 'Retry-safe leave'));
    const submit = () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Submit Planned Leave'))?.click();
    await act(async () => { submit(); await flushEffects(); });
    await act(async () => { submit(); await flushEffects(); });

    expect(mocks.submitLeave).toHaveBeenCalledTimes(2);
    expect(mocks.submitLeave.mock.calls[0][0].requestKey).toBe(mocks.submitLeave.mock.calls[1][0].requestKey);
  });

  it('starts a new keyed attempt when the Rider intentionally changes the request', async () => {
    mocks.isOnline = true;
    mocks.cached.mockResolvedValue(null);
    mocks.list.mockResolvedValue([]);
    mocks.submitLeave.mockRejectedValueOnce(new Error('Network response lost')).mockResolvedValueOnce('request-new');

    await act(async () => {
      root.render(<RiderLeaveAbsence userId="user-1" riderId="rider-1" />);
    });
    await flushEffects();
    act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Request Leave')?.click());
    const reason = container.querySelector('textarea') as HTMLTextAreaElement;
    act(() => setElementValue(reason, 'Original request'));
    const submit = () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Submit Planned Leave'))?.click();
    await act(async () => { submit(); await flushEffects(); });
    act(() => setElementValue(reason, 'Changed request content'));
    await act(async () => { submit(); await flushEffects(); });

    expect(mocks.submitLeave.mock.calls[0][0].requestKey).not.toBe(mocks.submitLeave.mock.calls[1][0].requestKey);
  });

  it('clears previous Rider rows when the identity changes and the new fetch fails', async () => {
    mocks.isOnline = true;
    mocks.cached.mockImplementation(async (userId: string) => userId === 'user-1' ? {
      userId: 'user-1', riderId: 'rider-1', cacheVersion: 1, fromDate: '2026-09-01', toDate: '2026-09-30',
      requests: [cachedRequest], cachedAt: '2026-09-07T00:00:00Z',
    } : null);
    mocks.list.mockImplementation(async ({ riderId }: { riderId: string }) => riderId === 'rider-1' ? [cachedRequest] : Promise.reject(new Error('New identity fetch failed')));

    await act(async () => {
      root.render(<RiderLeaveAbsence userId="user-1" riderId="rider-1" />);
    });
    await flushEffects();
    expect(container.textContent).toContain('Reason unavailable in offline cache.');

    await act(async () => {
      root.render(<RiderLeaveAbsence userId="user-2" riderId="rider-2" />);
      await flushEffects();
    });
    expect(container.textContent).not.toContain('Reason unavailable in offline cache.');
    expect(container.textContent).toContain('New identity fetch failed');
  });

  it('isolates every stateful control immediately when the Rider identity switches', async () => {
    mocks.isOnline = true;
    mocks.cached.mockImplementation(async (userId: string) => userId === 'user-1' ? {
      userId: 'user-1', riderId: 'rider-1', cacheVersion: 1, fromDate: '2026-09-01', toDate: '2026-09-30',
      requests: [cachedRequest], cachedAt: '2026-09-07T00:00:00Z',
    } : null);
    mocks.list.mockImplementation(async ({ riderId }: { riderId: string }) => riderId === 'rider-1' ? [cachedRequest] : []);

    await act(async () => {
      root.render(<RiderLeaveAbsence userId="user-1" riderId="rider-1" />);
    });
    await flushEffects();

    act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Request Leave')?.click());
    const leaveDates = Array.from(container.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    const leaveReason = container.querySelector('textarea') as HTMLTextAreaElement;
    act(() => {
      setElementValue(leaveDates[0], '2030-02-10');
      setElementValue(leaveDates[1], '2030-02-12');
      setElementValue(leaveReason, 'Private leave reason from Rider A');
    });
    expect(leaveDates[0].value).toBe('2030-02-10');
    expect(leaveDates[1].value).toBe('2030-02-12');
    expect(leaveReason.value).toBe('Private leave reason from Rider A');

    act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Report Absence')?.click());
    const absenceDate = container.querySelector('input[type="date"]') as HTMLInputElement;
    const absenceReason = container.querySelector('textarea') as HTMLTextAreaElement;
    act(() => {
      setElementValue(absenceDate, '2030-02-13');
      setElementValue(absenceReason, 'Private absence reason from Rider A');
    });
    expect(absenceDate.value).toBe('2030-02-13');
    expect(absenceReason.value).toBe('Private absence reason from Rider A');

    act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Current Requests')?.click());
    act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Withdraw'))?.click());
    const withdrawalDialog = document.body.querySelector('[role="dialog"]');
    const withdrawalReason = withdrawalDialog?.querySelector('textarea') as HTMLTextAreaElement;
    act(() => setElementValue(withdrawalReason, 'Private withdrawal reason from Rider A'));

    expect(document.body.textContent).toContain('Private withdrawal reason from Rider A');

    await act(async () => {
      root.render(<RiderLeaveAbsence userId="user-2" riderId="rider-2" />);
    });

    expect(container.textContent).not.toContain('Reason unavailable in offline cache.');
    expect(container.textContent).not.toContain('Private leave reason from Rider A');
    expect(container.textContent).not.toContain('Private absence reason from Rider A');
    expect(document.body.textContent).not.toContain('Private withdrawal reason from Rider A');
    expect(document.body.textContent).not.toContain('Withdraw request');

    await flushEffects();
    act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Request Leave')?.click());
    const newLeaveDates = Array.from(container.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    expect(newLeaveDates[0]?.value).not.toBe('2030-02-10');
    expect(newLeaveDates[1]?.value).not.toBe('2030-02-12');
    expect((container.querySelector('textarea') as HTMLTextAreaElement)?.value).toBe('');
  });

  it('starts a fresh logical submission key after an identity switch', async () => {
    mocks.isOnline = true;
    mocks.cached.mockResolvedValue(null);
    mocks.list.mockResolvedValue([]);
    mocks.submitLeave.mockRejectedValueOnce(new Error('Network response lost')).mockResolvedValueOnce('request-new');

    await act(async () => {
      root.render(<RiderLeaveAbsence userId="user-1" riderId="rider-1" />);
    });
    await flushEffects();
    act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Request Leave')?.click());
    act(() => setElementValue(container.querySelector('textarea') as HTMLTextAreaElement, 'Retry-safe leave'));
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Submit Planned Leave'))?.click();
      await flushEffects();
    });
    const firstKey = mocks.submitLeave.mock.calls[0][0].requestKey;

    await act(async () => {
      root.render(<RiderLeaveAbsence userId="user-2" riderId="rider-2" />);
    });
    await flushEffects();
    act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Request Leave')?.click());
    act(() => setElementValue(container.querySelector('textarea') as HTMLTextAreaElement, 'Retry-safe leave'));
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Submit Planned Leave'))?.click();
      await flushEffects();
    });

    expect(mocks.submitLeave).toHaveBeenCalledTimes(2);
    expect(mocks.submitLeave.mock.calls[1][0].requestKey).not.toBe(firstKey);
  });

  it('does not write a delayed response into cache after unmount', async () => {
    mocks.isOnline = true;
    mocks.cached.mockResolvedValue(null);
    let resolveList: ((value: typeof cachedRequest[]) => void) | undefined;
    mocks.list.mockReturnValue(new Promise((resolve) => { resolveList = resolve; }));

    await act(async () => {
      root.render(<RiderLeaveAbsence userId="user-1" riderId="rider-1" />);
    });
    await flushEffects();
    act(() => root.unmount());
    await act(async () => {
      resolveList?.([cachedRequest]);
      await flushEffects();
    });

    expect(mocks.setCached).not.toHaveBeenCalled();
  });

  it('labels an online cached view as revalidating until the server refresh succeeds', async () => {
    mocks.isOnline = true;
    mocks.cached.mockResolvedValue({
      userId: 'user-1', riderId: 'rider-1', cacheVersion: 1, fromDate: '2026-09-01', toDate: '2026-09-30',
      requests: [cachedRequest], cachedAt: '2026-09-05T00:00:00Z',
    });
    let resolveList: ((value: typeof cachedRequest[]) => void) | undefined;
    mocks.list.mockReturnValue(new Promise((resolve) => { resolveList = resolve; }));

    await act(async () => {
      root.render(<RiderLeaveAbsence userId="user-1" riderId="rider-1" />);
    });
    await flushEffects();
    expect(container.textContent).toContain('Cached / Revalidating');

    await act(async () => {
      resolveList?.([]);
      await flushEffects();
    });
    expect(container.textContent).toContain('Online');
    expect(container.textContent).not.toContain('Cached / Revalidating');
  });

  it('keeps the cached view explicit when server revalidation fails', async () => {
    mocks.isOnline = true;
    mocks.cached.mockResolvedValue({
      userId: 'user-1', riderId: 'rider-1', cacheVersion: 1, fromDate: '2026-09-01', toDate: '2026-09-30',
      requests: [cachedRequest], cachedAt: '2026-09-05T00:00:00Z',
    });
    mocks.list.mockRejectedValueOnce(new Error('Server revalidation failed'));

    await act(async () => {
      root.render(<RiderLeaveAbsence userId="user-1" riderId="rider-1" />);
    });
    await flushEffects();

    expect(container.textContent).toContain('Cached / Revalidation failed');
    expect(container.textContent).toContain('Server revalidation failed');
    expect(container.textContent).toContain('Reason unavailable in offline cache.');
  });
});
