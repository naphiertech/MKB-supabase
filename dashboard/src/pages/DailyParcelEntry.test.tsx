// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyParcelRow } from '../services/operationsService';
import { DailyParcelEntry } from './DailyParcelEntry';

const mocks = vi.hoisted(() => ({
  getDailyParcelEntries: vi.fn(),
  saveDailyParcelEntries: vi.fn(),
  createParcelCorrectionRequest: vi.fn(),
  isCutoffLockedForDate: vi.fn(),
  getZones: vi.fn(),
  getRidersLookup: vi.fn(),
  pushToast: vi.fn(),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'ops@mkb.test' } }),
}));
vi.mock('../hooks/useToast', () => ({ pushToast: mocks.pushToast }));
vi.mock('../services/geofencing/geofenceService', () => ({ getZones: mocks.getZones }));
vi.mock('../services/riders/riderService', () => ({ getRidersLookup: mocks.getRidersLookup }));
vi.mock('../services/operationsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/operationsService')>();
  return {
    ...actual,
    getDailyParcelEntries: mocks.getDailyParcelEntries,
    saveDailyParcelEntries: mocks.saveDailyParcelEntries,
    createParcelCorrectionRequest: mocks.createParcelCorrectionRequest,
    isCutoffLockedForDate: mocks.isCutoffLockedForDate,
  };
});

function makeRow(id: string, overrides: Partial<DailyParcelRow> = {}): DailyParcelRow {
  return {
    riderId: id,
    riderName: id === 'rider-1' ? 'Juan Rider' : 'Maria Rider',
    riderMkbId: id === 'rider-1' ? 'MKB-001' : 'MKB-002',
    riderAvatar: '',
    zoneId: 'zone-1',
    zoneName: 'North Hub',
    attendanceStatus: 'present',
    timeIn: '8:00 AM',
    rawTimeIn: '2026-08-20T00:00:00.000Z',
    timeOut: null,
    hours: 8,
    deliveredParcels: 10,
    heavyParcels: 2,
    assignedParcels: 15,
    failedDeliveries: 1,
    returnedParcels: 2,
    notes: 'Saved note',
    recordedBy: 'user-1',
    recordedByName: 'Operations Staff',
    recordedByDetail: 'HR Operations',
    submissionStatus: 'draft',
    lastUpdated: '2026-08-20T08:00:00.000Z',
    parcelLogId: `log-${id}`,
    standardRate: 8,
    heavyRate: 10,
    standardEarnings: 80,
    heavyEarnings: 20,
    dailyGross: 100,
    rateConfigurationId: 'rate-1',
    rateConfigurationEffectiveFrom: '2026-01-01',
    isModified: false,
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

describe('DailyParcelEntry persistence characterization', () => {
  let container: HTMLDivElement;
  let root: Root;
  let rows: DailyParcelRow[];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    rows = [makeRow('rider-1'), makeRow('rider-2')];
    mocks.getZones.mockResolvedValue([{ id: 'zone-1', name: 'North Hub' }]);
    mocks.getRidersLookup.mockResolvedValue(rows.map(row => ({
      id: row.riderId, name: row.riderName, mkb_id: row.riderMkbId, zone_id: row.zoneId,
    })));
    mocks.getDailyParcelEntries.mockImplementation(async () => ({
      rows,
      absentRows: [],
      totalEligibleCount: rows.length,
      encodedCount: 0,
      absentCount: 0,
      rateContext: {
        configurationId: 'rate-1', effectiveFrom: '2026-01-01', earlyStandardRate: 8,
        regularStandardRate: 7, lateStandardRate: 6, heavyParcelRate: 10, heavyThresholdKg: 4,
      },
    }));
    mocks.saveDailyParcelEntries.mockResolvedValue(1);
    mocks.createParcelCorrectionRequest.mockResolvedValue({ id: 'correction-1' });
    mocks.isCutoffLockedForDate.mockResolvedValue(false);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root.render(<DailyParcelEntry />); });
    await flushAsyncWork();
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('uses the normal save workflow for an unlocked cutoff', async () => {
    const standard = document.querySelector<HTMLInputElement>('input[aria-label="Standard delivered for Juan Rider"]');
    expect(standard).toBeTruthy();
    changeInput(standard!, '12');
    clickButton('Save', true);
    await flushAsyncWork();

    expect(mocks.saveDailyParcelEntries).toHaveBeenCalledWith([
      expect.objectContaining({ riderId: 'rider-1', parcels: 12 }),
    ], 'user-1');
    expect(mocks.createParcelCorrectionRequest).not.toHaveBeenCalled();
  });

  it('creates a correction request instead of normal save for a locked cutoff', async () => {
    mocks.isCutoffLockedForDate.mockResolvedValue(true);
    clickButton('Details');
    await flushAsyncWork();
    const reason = document.querySelector<HTMLTextAreaElement>('textarea[placeholder^="Describe the discrepancy"]');
    expect(reason).toBeTruthy();
    changeInput(reason!, 'Correct the locked parcel count');
    clickButton('Submit Correction Request');
    await flushAsyncWork();

    expect(mocks.createParcelCorrectionRequest).toHaveBeenCalledWith(expect.objectContaining({
      parcelLogId: 'log-rider-1',
      riderId: 'rider-1',
      reason: 'Correct the locked parcel count',
    }));
    expect(mocks.saveDailyParcelEntries).not.toHaveBeenCalled();
  });

  it('bulk saves only rows whose four outcome counts changed', async () => {
    const returned = document.querySelector<HTMLInputElement>('input[aria-label="Returned for Juan Rider"]');
    expect(returned).toBeTruthy();
    changeInput(returned!, '5');
    clickButton('Save All');
    await flushAsyncWork();

    expect(mocks.saveDailyParcelEntries).toHaveBeenCalledWith([
      expect.objectContaining({ riderId: 'rider-1', returnedParcels: 5 }),
    ], 'user-1');
  });

  it('preserves service validation errors and the entered invalid value', async () => {
    mocks.saveDailyParcelEntries.mockRejectedValue(new Error('Returned parcels must be a non-negative whole number.'));
    const returned = document.querySelector<HTMLInputElement>('input[aria-label="Returned for Juan Rider"]');
    expect(returned).toBeTruthy();
    changeInput(returned!, '-1');
    clickButton('Save', true);
    await flushAsyncWork();

    expect(mocks.saveDailyParcelEntries).toHaveBeenCalledWith([
      expect.objectContaining({ riderId: 'rider-1', returnedParcels: -1 }),
    ], 'user-1');
    expect(mocks.pushToast).toHaveBeenCalledWith({
      title: 'Save Failed',
      description: 'Returned parcels must be a non-negative whole number.',
      tone: 'error',
    });
    expect(returned!.value).toBe('-1');
  });

  it('uses one authoritative drawer draft for every field in a single-row save', async () => {
    const standard = document.querySelector<HTMLInputElement>('input[aria-label="Standard delivered for Juan Rider"]');
    expect(standard).toBeTruthy();
    changeInput(standard!, '12');
    clickButton('Details');
    await flushAsyncWork();

    const drawer = document.querySelector<HTMLElement>('[role="dialog"]');
    const drawerNumbers = drawer?.querySelectorAll<HTMLInputElement>('input[type="number"]');
    expect(drawerNumbers?.length).toBeGreaterThanOrEqual(2);
    changeInput(drawerNumbers![0], '20');
    changeInput(drawerNumbers![1], '6');
    clickButton('Save', true);
    await flushAsyncWork();

    expect(mocks.saveDailyParcelEntries).toHaveBeenCalledWith([
      expect.objectContaining({
        riderId: 'rider-1',
        parcels: 20,
        heavyParcels: 6,
        assignedParcels: 15,
        failedDeliveries: 1,
        returnedParcels: 2,
        notes: 'Saved note',
      }),
    ], 'user-1');
  });
});
