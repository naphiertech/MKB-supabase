// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDirectory: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  publish: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('../context/HubContext', () => ({
  useHub: () => ({
    hubs: [{ id: 'hub-1', name: 'Main Hub', description: null, active: true, latitude: null, longitude: null, attendanceRadiusM: null, createdAt: '', updatedAt: '' }],
    selectedHubId: 'hub-1',
  }),
}));

vi.mock('../services/workforce/workforceDirectoryService', () => ({
  getRiderWorkforceDirectory: mocks.getDirectory,
}));

vi.mock('../services/workforce/riderScheduleService', async () => {
  const actual = await vi.importActual<typeof import('../services/workforce/riderScheduleService')>('../services/workforce/riderScheduleService');
  return {
    ...actual,
    getManilaBusinessDate: () => '2026-09-07',
    startOfBusinessWeek: () => '2026-09-07',
    listRiderSchedules: mocks.list,
    createRiderSchedule: mocks.create,
    updateRiderSchedule: mocks.update,
    publishRiderSchedule: mocks.publish,
    cancelRiderSchedule: mocks.cancel,
  };
});

import { RiderScheduling } from './RiderScheduling';

const rider = {
  id: 'rider-1',
  name: 'Juan Dela Cruz',
  mkb_id: 'MKB-1',
  zone_id: undefined,
  zones: null,
  employmentStatus: 'active' as const,
  archiveEffectiveDate: null,
  restoredAt: null,
  hubId: 'hub-1',
};

const draftSchedule = {
  id: 'schedule-1', riderId: 'rider-1', riderName: 'Juan Dela Cruz', riderMkbId: 'MKB-1',
  workDate: '2026-09-08', hubId: 'hub-1', hubName: 'Main Hub', dayKind: 'work' as const,
  startsAt: '08:00', endsAt: '17:00', status: 'draft' as const, revision: 1,
  createdAt: '2026-09-07T00:00:00Z', updatedAt: '2026-09-07T00:00:00Z',
  publishedAt: null, cancelledAt: null, cancellationReason: null,
};

async function flushEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setElementValue(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

describe('RiderScheduling', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.getDirectory.mockResolvedValue([rider]);
    mocks.list.mockResolvedValue([]);
    mocks.create.mockResolvedValue('schedule-new');
    mocks.update.mockResolvedValue('schedule-1');
    mocks.publish.mockResolvedValue('schedule-1');
    mocks.cancel.mockResolvedValue('schedule-1');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.querySelectorAll('[role="dialog"]').forEach((node) => node.remove());
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('renders the bounded Hub calendar and keeps Day Off free of times', async () => {
    await act(async () => {
      root.render(<RiderScheduling />);
    });
    await flushEffects();

    expect(container.textContent).toContain('Rider Scheduling');
    expect(container.textContent).toContain('Juan Dela Cruz');
    expect(mocks.list).toHaveBeenCalledWith({ fromDate: '2026-09-07', toDate: '2026-09-13', hubId: 'hub-1' });

    const addButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Add schedule'));
    expect(addButton).toBeDefined();
    act(() => addButton?.click());

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Create Draft Schedule');
    const planType = dialog?.querySelectorAll('select')[1] as HTMLSelectElement;
    act(() => setElementValue(planType, 'day_off'));
    await flushEffects();

    expect(dialog?.textContent).toContain('Day Off contains no working interval');
    expect(dialog?.textContent).not.toContain('Planned start');

    const saveButton = Array.from(dialog?.querySelectorAll('button') ?? []).find((button) => button.textContent?.includes('Save draft'));
    act(() => saveButton?.click());
    expect(dialog?.textContent).toContain('Add a short reason');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('exposes publish and cancel actions for a draft and sends the revision', async () => {
    mocks.list.mockResolvedValue([draftSchedule]);
    await act(async () => {
      root.render(<RiderScheduling />);
    });
    await flushEffects();

    const scheduleButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('08:00–17:00'));
    expect(scheduleButton).toBeDefined();
    act(() => scheduleButton?.click());

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Publish');
    expect(dialog?.textContent).toContain('Cancel schedule');

    const reason = dialog?.querySelector('textarea') as HTMLTextAreaElement;
    act(() => setElementValue(reason, 'Coverage approved'));
    await flushEffects();
    const publishButton = Array.from(dialog?.querySelectorAll('button') ?? []).find((button) => button.textContent?.includes('Publish'));
    await act(async () => {
      publishButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.publish).toHaveBeenCalledWith('schedule-1', 1, 'Coverage approved');
  });

  it('shows an actionable load error without changing another module', async () => {
    mocks.list.mockRejectedValueOnce(new Error('Scheduling service unavailable.'));
    await act(async () => {
      root.render(<RiderScheduling />);
    });
    await flushEffects();

    expect(container.textContent).toContain('Unable to load Rider Scheduling');
    expect(container.textContent).toContain('Scheduling service unavailable.');
    expect(container.textContent).toContain('Retry');
  });
});
