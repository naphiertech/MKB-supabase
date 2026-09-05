// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isOnline: false,
  cached: vi.fn(),
  list: vi.fn(),
  setCached: vi.fn(),
}));

vi.mock('../hooks/useNetworkStatus', () => ({ useNetworkStatus: () => mocks.isOnline }));
vi.mock('../services/workforce/riderScheduleService', async () => {
  const actual = await vi.importActual<typeof import('../services/workforce/riderScheduleService')>('../services/workforce/riderScheduleService');
  return {
    ...actual,
    getManilaBusinessDate: () => '2026-09-07',
    startOfBusinessWeek: () => '2026-09-07',
    getCachedRiderSchedules: mocks.cached,
    listRiderSchedules: mocks.list,
    setCachedRiderSchedules: mocks.setCached,
  };
});

import { RiderSchedule } from './RiderSchedule';

const cachedSchedule = {
  id: 'schedule-1', riderId: 'rider-1', riderName: 'Juan Dela Cruz', riderMkbId: 'MKB-1',
  workDate: '2026-09-08', hubId: 'hub-1', hubName: 'Main Hub', dayKind: 'work' as const,
  startsAt: '08:00', endsAt: '17:00', status: 'published' as const, revision: 2,
  createdAt: '2026-09-07T00:00:00Z', updatedAt: '2026-09-07T00:00:00Z',
  publishedAt: '2026-09-07T00:00:00Z', cancelledAt: null, cancellationReason: null,
};

async function flushEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('RiderSchedule', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.isOnline = false;
    mocks.cached.mockResolvedValue({
      userId: 'user-1', riderId: 'rider-1', fromDate: '2026-09-07', toDate: '2026-09-13',
      schedules: [cachedSchedule], cachedAt: '2026-09-07T00:00:00Z',
    });
    mocks.list.mockResolvedValue([]);
    mocks.setCached.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('renders a stale cached agenda offline and never blocks attendance', async () => {
    await act(async () => {
      root.render(<RiderSchedule userId="user-1" riderId="rider-1" />);
    });
    await flushEffects();

    expect(container.textContent).toContain('My Schedule');
    expect(container.textContent).toContain('Offline view');
    expect(container.textContent).toContain('Cached copy · may be stale');
    expect(container.textContent).toContain('08:00 – 17:00');
    expect(container.textContent).toContain('Main Hub');
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
