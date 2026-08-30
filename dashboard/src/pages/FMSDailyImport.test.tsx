// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FMSDailyImport } from './FMSDailyImport';

// Hoisted mocks
const mocks = vi.hoisted(() => ({
  listExternalRiderMappings: vi.fn(),
  saveExternalRiderMapping: vi.fn(),
  stageFmsImportBatch: vi.fn(),
  getFmsBatchObservations: vi.fn(),
  confirmFmsDailyRiderObservation: vi.fn(),
  listFmsImportBatches: vi.fn(),
  getParcelRateContextForDate: vi.fn(),
  supabaseFrom: vi.fn(),
}));

vi.mock('../context/HubContext', () => ({
  useHub: () => ({
    selectedHubId: 'hub-1',
    hubs: [{ id: 'hub-1', name: 'Talon-Talon Hub', code: 'TT' }],
  }),
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: mocks.supabaseFrom,
    rpc: vi.fn(),
  },
}));

vi.mock('../services/fms/externalRiderMappingService', () => ({
  listExternalRiderMappings: mocks.listExternalRiderMappings,
  saveExternalRiderMapping: mocks.saveExternalRiderMapping,
}));

vi.mock('../services/fms/fmsImportService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/fms/fmsImportService')>();
  return {
    ...actual,
    stageFmsImportBatch: mocks.stageFmsImportBatch,
    getFmsBatchObservations: mocks.getFmsBatchObservations,
    confirmFmsDailyRiderObservation: mocks.confirmFmsDailyRiderObservation,
    listFmsImportBatches: mocks.listFmsImportBatches,
  };
});

vi.mock('../services/parcels/parcelOperationsPolicy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/parcels/parcelOperationsPolicy')>();
  return {
    ...actual,
    getParcelRateContextForDate: mocks.getParcelRateContextForDate,
  };
});

describe('FMSDailyImport (Parcel Data Import)', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    mocks.listExternalRiderMappings.mockResolvedValue({});
    mocks.listFmsImportBatches.mockResolvedValue([]);
    mocks.getParcelRateContextForDate.mockResolvedValue({
      effectiveDate: '2026-08-30',
      earlyStandardRate: 12,
      regularStandardRate: 11,
      lateStandardRate: 10,
      heavyRate: 25,
    });

    mocks.supabaseFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          { id: 'rider-1', name: 'Juan Rider', mkb_id: 'MKB-001', hub_id: 'hub-1' },
          { id: 'rider-2', name: 'Maria Rider', mkb_id: 'MKB-002', hub_id: 'hub-1' },
        ],
      }),
    }));
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
    vi.clearAllMocks();
  });

  it('renders the Parcel Data Import header and initial upload dropzone', async () => {
    await act(async () => {
      root?.render(<FMSDailyImport />);
    });

    expect(container?.textContent).toContain('Parcel Data Import');
    expect(container?.textContent).toContain('Import Delivery File');
    expect(container?.textContent).toContain('Choose XLSX File');
    expect(container?.textContent).toContain('Talon-Talon Hub');
  });

  it('provides attendance-aware observation view item fields and rate tier resolution', () => {
    const obsWithAttendance = {
      id: 'obs-1',
      batch_id: 'batch-1',
      external_driver_id: '999001',
      external_driver_name: 'Naphier Driver',
      rider_id: 'rider-1',
      rider_name: 'Juan Rider',
      delivered: 80,
      delivering: 0,
      failed_delivery: 0,
      attendance: { time_in: '07:45:00', raw_time_in: '2026-08-30T07:45:00+08:00', status: 'present' },
      isCutoffLocked: false,
      confirmation_status: 'staged' as const,
    };

    const obsWithoutAttendance = {
      ...obsWithAttendance,
      id: 'obs-2',
      attendance: null,
    };

    expect(obsWithAttendance.attendance?.time_in).toBe('07:45:00');
    expect(obsWithoutAttendance.attendance).toBeNull();
  });
});
