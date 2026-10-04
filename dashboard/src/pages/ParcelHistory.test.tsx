// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParcelHistoryItem } from '../services/operationsService';
import { ParcelHistory } from './ParcelHistory';

const mocks = vi.hoisted(() => ({
  getParcelHistory: vi.fn(),
  getParcelLogAuditHistory: vi.fn(),
  getParcelCorrectionRequests: vi.fn(),
  reviewParcelCorrectionRequest: vi.fn(),
  saveDailyParcelEntries: vi.fn(),
  createParcelCorrectionRequest: vi.fn(),
  isCutoffLockedForDate: vi.fn(),
  getZones: vi.fn(),
  getRidersLookup: vi.fn(),
  pushToast: vi.fn(),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', email: 'admin@mkb.test' },
    session: { role: 'admin' },
  }),
}));

vi.mock('../hooks/useToast', () => ({ pushToast: mocks.pushToast }));
vi.mock('../services/geofencing/geofenceService', () => ({ getZones: mocks.getZones }));
vi.mock('../services/riders/riderService', () => ({ getRidersLookup: mocks.getRidersLookup }));

vi.mock('../services/operationsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/operationsService')>();
  return {
    ...actual,
    getParcelHistory: mocks.getParcelHistory,
    getParcelLogAuditHistory: mocks.getParcelLogAuditHistory,
    getParcelCorrectionRequests: mocks.getParcelCorrectionRequests,
    reviewParcelCorrectionRequest: mocks.reviewParcelCorrectionRequest,
    saveDailyParcelEntries: mocks.saveDailyParcelEntries,
    createParcelCorrectionRequest: mocks.createParcelCorrectionRequest,
    isCutoffLockedForDate: mocks.isCutoffLockedForDate,
  };
});

function makeItem(id: string, overrides: Partial<ParcelHistoryItem> = {}): ParcelHistoryItem {
  return {
    id: `log-${id}`,
    riderId: id,
    riderName: 'Juan Rider',
    riderMkbId: 'MKB-001',
    riderAvatar: '',
    zoneId: 'zone-1',
    zoneName: 'Central Hub',
    date: '2026-10-04',
    deliveredParcels: 17,
    heavyParcels: 2,
    totalDelivered: 19,
    totalHandled: 20,
    deliverySuccessRate: 95,
    grossWagePreview: 170,
    dailyGross: 170,
    payrollCutoff: '2026-10-01 to 2026-10-15',
    assignedParcels: 20,
    failedDeliveries: 1,
    returnedParcels: 0,
    notes: 'Sample note',
    createdBy: 'admin-1',
    createdByName: 'Admin User',
    createdAt: '2026-10-04T08:00:00.000Z',
    updatedAt: '2026-10-04T08:00:00.000Z',
    attendanceStatus: 'present',
    timeIn: '08:00 AM',
    standardRate: 8,
    heavyRate: 10,
    standardEarnings: 136,
    heavyEarnings: 20,
    ...overrides,
  };
}

function clickButton(label: string, exact = false) {
  const button = Array.from(document.querySelectorAll('button'))
    .find(candidate => exact
      ? candidate.textContent?.trim() === label
      : candidate.textContent?.includes(label));
  expect(button, `button containing ${label}`).toBeTruthy();
  act(() => button!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

function changeInput(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ParcelHistory drawer draft edit reason requirements', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    mocks.getZones.mockResolvedValue([]);
    mocks.getRidersLookup.mockResolvedValue([]);
    mocks.getParcelLogAuditHistory.mockResolvedValue([]);
    mocks.getParcelCorrectionRequests.mockResolvedValue([]);
    mocks.isCutoffLockedForDate.mockResolvedValue(false); // draft period
    mocks.saveDailyParcelEntries.mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('requires reason on draft parcel count modification (17 -> 19) and submits with reason', async () => {
    const item = makeItem('rider-1', { deliveredParcels: 17, heavyParcels: 2 });
    mocks.getParcelHistory.mockResolvedValue({ data: [item], totalCount: 1 });

    await act(async () => {
      root.render(<ParcelHistory />);
    });
    await flushAsyncWork();

    // 1. Open drawer by clicking row
    const row = document.querySelector('tbody tr');
    expect(row).toBeTruthy();
    act(() => row!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await flushAsyncWork();

    // 2. Click "Edit Manifest"
    clickButton('Edit Manifest');
    await flushAsyncWork();

    // 3. Find standard delivered input (currently 17)
    const inputs = Array.from(document.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    const standardInput = inputs[0];
    expect(standardInput.value).toBe('17');

    // Initially when counts match (17), Reason for Modification textarea does not exist
    expect(document.body.textContent).not.toContain('Reason for Modification');

    // 4. Change 17 -> 19
    changeInput(standardInput, '19');
    await flushAsyncWork();

    // 5. Assert "Reason for Modification *" field appears
    expect(document.body.textContent).toContain('Reason for Modification');
    expect(document.body.textContent).toContain('Mandatory for audit trail traceability');

    // 6. Assert submit button is disabled when reason is empty
    const submitBtn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Save Direct Edits')) as HTMLButtonElement;
    expect(submitBtn).toBeTruthy();
    expect(submitBtn.disabled).toBe(true);

    // 7. Enter whitespace-only reason -> still disabled
    const reasonTextarea = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(reasonTextarea).toBeTruthy();
    changeInput(reasonTextarea, '    ');
    await flushAsyncWork();
    expect(submitBtn.disabled).toBe(true);

    // 8. Enter valid reason -> button becomes enabled
    changeInput(reasonTextarea, '2 parcels missing from initial entry');
    await flushAsyncWork();
    expect(submitBtn.disabled).toBe(false);

    // 9. Click submit and verify saveDailyParcelEntries called with payload containing reason
    act(() => submitBtn.click());
    await flushAsyncWork();

    expect(mocks.saveDailyParcelEntries).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          riderId: 'rider-1',
          date: '2026-10-04',
          parcels: 19,
          reason: '2 parcels missing from initial entry',
        }),
      ],
      'admin-1'
    );
  });

  it('does not require reason when draft parcel counts are unchanged', async () => {
    const item = makeItem('rider-2', { deliveredParcels: 17, heavyParcels: 2 });
    mocks.getParcelHistory.mockResolvedValue({ data: [item], totalCount: 1 });

    await act(async () => {
      root.render(<ParcelHistory />);
    });
    await flushAsyncWork();

    const row = document.querySelector('tbody tr');
    act(() => row!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await flushAsyncWork();

    clickButton('Edit Manifest');
    await flushAsyncWork();

    // Counts remain 17 standard / 2 heavy (unchanged)
    expect(document.body.textContent).not.toContain('Reason for Modification');

    const submitBtn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Save Direct Edits')) as HTMLButtonElement;
    expect(submitBtn).toBeTruthy();
    expect(submitBtn.disabled).toBe(false);
  });

  it('routes to createParcelCorrectionRequest when cutoff is locked', async () => {
    const item = makeItem('rider-3', { deliveredParcels: 17, heavyParcels: 2 });
    mocks.getParcelHistory.mockResolvedValue({ data: [item], totalCount: 1 });
    mocks.isCutoffLockedForDate.mockResolvedValue(true); // Locked cutoff

    await act(async () => {
      root.render(<ParcelHistory />);
    });
    await flushAsyncWork();

    const row = document.querySelector('tbody tr');
    act(() => row!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await flushAsyncWork();

    clickButton('Request Correction');
    await flushAsyncWork();

    // In locked mode, button text is Submit Correction Request
    const submitBtn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Submit Correction Request')) as HTMLButtonElement;
    expect(submitBtn).toBeTruthy();
    expect(submitBtn.disabled).toBe(true);

    const reasonTextarea = document.querySelector('textarea') as HTMLTextAreaElement;
    changeInput(reasonTextarea, 'Audit dispute resolution');
    await flushAsyncWork();
    expect(submitBtn.disabled).toBe(false);

    act(() => submitBtn.click());
    await flushAsyncWork();

    expect(mocks.createParcelCorrectionRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        parcelLogId: 'log-rider-3',
        riderId: 'rider-3',
        date: '2026-10-04',
        reason: 'Audit dispute resolution',
      })
    );
  });
});

