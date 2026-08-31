// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FMSDailyImport } from './FMSDailyImport';
import type { FmsImportBatch, FmsObservationViewItem } from '../services/fms/fmsImportService';

const mockBatches: FmsImportBatch[] = [
  {
    id: 'batch-staged-unmapped',
    source_system: 'spx_fms',
    business_date: '2026-08-30',
    filename: 'Morning_Fleet.xlsx',
    file_sha256: 'sha-morning',
    hub_id: 'hub-1',
    imported_by: 'user-1',
    imported_at: '2026-08-30T03:00:00Z',
    source_row_count: 2,
    status: 'staged',
    parser_version: 'Delivery V3.0',
    created_at: '2026-08-30T03:00:00Z',
  },
  {
    id: 'batch-staged-all-mapped',
    source_system: 'spx_fms',
    business_date: '2026-08-30',
    filename: 'Afternoon_Fleet.xlsx',
    file_sha256: 'sha-afternoon',
    hub_id: 'hub-1',
    imported_by: 'user-1',
    imported_at: '2026-08-30T08:00:00Z',
    source_row_count: 2,
    status: 'staged',
    parser_version: 'Delivery V3.0',
    created_at: '2026-08-30T08:00:00Z',
  },
  {
    id: 'batch-confirmed',
    source_system: 'spx_fms',
    business_date: '2026-08-30',
    filename: 'Night_Fleet.xlsx',
    file_sha256: 'sha-night',
    hub_id: 'hub-1',
    imported_by: 'user-1',
    imported_at: '2026-08-30T12:00:00Z',
    source_row_count: 2,
    status: 'confirmed',
    parser_version: 'Delivery V3.0',
    created_at: '2026-08-30T12:00:00Z',
  },
  {
    id: 'batch-cancelled',
    source_system: 'spx_fms',
    business_date: '2026-08-29',
    filename: 'Cancelled_Fleet.xlsx',
    file_sha256: 'sha-cancelled',
    hub_id: 'hub-1',
    imported_by: 'user-1',
    imported_at: '2026-08-29T10:00:00Z',
    source_row_count: 1,
    status: 'cancelled',
    parser_version: 'Delivery V3.0',
    created_at: '2026-08-29T10:00:00Z',
  },
];

const mockObservationsByBatch: Record<string, FmsObservationViewItem[]> = {
  'batch-staged-unmapped': [
    {
      id: 'obs-1',
      batch_id: 'batch-staged-unmapped',
      external_driver_id: '355765',
      external_driver_name: 'Mark Sheldon',
      rider_id: 'rider-1',
      rider_name: 'Mark Sheldon Alconaba',
      rider_mkb_id: 'MKB-101',
      assigned: 100,
      assigned_target: 100,
      handed_over: 90,
      delivered: 85,
      delivering: 5,
      failed_delivery: 5,
      stuck_at_delivering: 0,
      on_hold: 0,
      first_delivering_time: '08:15:00',
      first_delivering_time_raw: '2026-08-30T08:15:00Z',
      time_since_last_delivery: null,
      confirmation_status: 'staged',
      confirmed_at: null,
      confirmed_by: null,
      confirmed_standard_delivered: null,
      confirmed_heavy_delivered: null,
      confirmed_failed: null,
      confirmed_returned: null,
      parcel_log_id: null,
      existingParcelLog: null,
      priorSnapshot: null,
      isCutoffLocked: false,
      cutoffStatus: null,
      attendance: {
        status: 'present',
        time_in: '08:00 AM',
        raw_time_in: '2026-08-30T08:00:00Z',
      },
    },
    {
      id: 'obs-2',
      batch_id: 'batch-staged-unmapped',
      external_driver_id: '999999',
      external_driver_name: 'Unknown Driver',
      rider_id: null,
      rider_name: undefined,
      rider_mkb_id: undefined,
      assigned: 50,
      assigned_target: 50,
      handed_over: 50,
      delivered: 45,
      delivering: 0,
      failed_delivery: 5,
      stuck_at_delivering: 0,
      on_hold: 0,
      first_delivering_time: '08:30:00',
      first_delivering_time_raw: '2026-08-30T08:30:00Z',
      time_since_last_delivery: null,
      confirmation_status: 'staged',
      confirmed_at: null,
      confirmed_by: null,
      confirmed_standard_delivered: null,
      confirmed_heavy_delivered: null,
      confirmed_failed: null,
      confirmed_returned: null,
      parcel_log_id: null,
      existingParcelLog: null,
      priorSnapshot: null,
      isCutoffLocked: false,
      cutoffStatus: null,
      attendance: null,
    },
  ],
  'batch-staged-all-mapped': [
    {
      id: 'obs-3',
      batch_id: 'batch-staged-all-mapped',
      external_driver_id: '355765',
      external_driver_name: 'Mark Sheldon',
      rider_id: 'rider-1',
      rider_name: 'Mark Sheldon Alconaba',
      rider_mkb_id: 'MKB-101',
      assigned: 100,
      assigned_target: 100,
      handed_over: 90,
      delivered: 85,
      delivering: 5,
      failed_delivery: 5,
      stuck_at_delivering: 0,
      on_hold: 0,
      first_delivering_time: '08:15:00',
      first_delivering_time_raw: '2026-08-30T08:15:00Z',
      time_since_last_delivery: null,
      confirmation_status: 'staged',
      confirmed_at: null,
      confirmed_by: null,
      confirmed_standard_delivered: null,
      confirmed_heavy_delivered: null,
      confirmed_failed: null,
      confirmed_returned: null,
      parcel_log_id: null,
      existingParcelLog: null,
      priorSnapshot: null,
      isCutoffLocked: false,
      cutoffStatus: null,
      attendance: {
        status: 'present',
        time_in: '08:00 AM',
        raw_time_in: '2026-08-30T08:00:00Z',
      },
    },
    {
      id: 'obs-4',
      batch_id: 'batch-staged-all-mapped',
      external_driver_id: '371984',
      external_driver_name: 'Edemer Jimlan',
      rider_id: 'rider-2',
      rider_name: 'Edemer Malong Jimlan',
      rider_mkb_id: 'MKB-102',
      assigned: 80,
      assigned_target: 80,
      handed_over: 80,
      delivered: 75,
      delivering: 0,
      failed_delivery: 5,
      stuck_at_delivering: 0,
      on_hold: 0,
      first_delivering_time: '08:10:00',
      first_delivering_time_raw: '2026-08-30T08:10:00Z',
      time_since_last_delivery: null,
      confirmation_status: 'staged',
      confirmed_at: null,
      confirmed_by: null,
      confirmed_standard_delivered: null,
      confirmed_heavy_delivered: null,
      confirmed_failed: null,
      confirmed_returned: null,
      parcel_log_id: null,
      existingParcelLog: null,
      priorSnapshot: null,
      isCutoffLocked: false,
      cutoffStatus: null,
      attendance: {
        status: 'present',
        time_in: '08:15 AM',
        raw_time_in: '2026-08-30T08:15:00Z',
      },
    },
  ],
  'batch-confirmed': [
    {
      id: 'obs-5',
      batch_id: 'batch-confirmed',
      external_driver_id: '355765',
      external_driver_name: 'Mark Sheldon',
      rider_id: 'rider-1',
      rider_name: 'Mark Sheldon Alconaba',
      rider_mkb_id: 'MKB-101',
      assigned: 100,
      assigned_target: 100,
      handed_over: 90,
      delivered: 85,
      delivering: 0,
      failed_delivery: 5,
      stuck_at_delivering: 0,
      on_hold: 0,
      first_delivering_time: '08:15:00',
      first_delivering_time_raw: '2026-08-30T08:15:00Z',
      time_since_last_delivery: null,
      confirmation_status: 'confirmed',
      confirmed_at: '2026-08-30T12:00:00Z',
      confirmed_by: 'user-1',
      confirmed_standard_delivered: 75,
      confirmed_heavy_delivered: 10,
      confirmed_failed: 5,
      confirmed_returned: 0,
      parcel_log_id: 'log-1',
      existingParcelLog: {
        id: 'log-1',
        parcels: 75,
        heavy_parcels: 10,
        failed_parcels: 5,
        returned_parcels: 0,
        assigned_parcels: 100,
        updated_at: '2026-08-30T12:00:00Z',
      },
      priorSnapshot: null,
      isCutoffLocked: false,
      cutoffStatus: null,
      attendance: {
        status: 'present',
        time_in: '08:00 AM',
        raw_time_in: '2026-08-30T08:00:00Z',
      },
    },
  ],
};

vi.mock('../context/HubContext', () => ({
  useHub: () => ({
    selectedHubId: 'hub-1',
    hubs: [{ id: 'hub-1', name: 'Talon-Talon Hub' }],
  }),
}));

vi.mock('../services/fms/fmsImportService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/fms/fmsImportService')>();
  return {
    ...actual,
    listFmsImportBatches: vi.fn(async () => mockBatches),
    getFmsImportBatchById: vi.fn(async (id: string) => mockBatches.find((b) => b.id === id) || null),
    getFmsBatchObservations: vi.fn(async (id: string) => mockObservationsByBatch[id] || []),
  };
});

vi.mock('../services/fms/externalRiderMappingService', () => ({
  listExternalRiderMappings: vi.fn(async () => ({
    '355765': {
      id: 'map-1',
      external_driver_id: '355765',
      external_display_name: 'Mark Sheldon',
      source_system: 'spx_fms',
      rider_id: 'rider-1',
      is_active: true,
      created_at: '2026-08-30T00:00:00Z',
      updated_at: '2026-08-30T00:00:00Z',
    },
  })),
  saveExternalRiderMapping: vi.fn(async () => ({ success: true })),
}));

vi.mock('../services/parcels/parcelOperationsPolicy', () => ({
  getParcelRateContextForDate: vi.fn(async () => ({
    earlyStandardRate: 12,
    regularStandardRate: 11,
    lateStandardRate: 10,
    heavyRate: 25,
  })),
  resolveRateTierInfo: vi.fn(() => ({
    tier: 'early',
    label: 'Early (≤08:00)',
    rate: 12,
  })),
}));

vi.mock('../lib/supabaseClient', () => {
  const createQueryBuilder = () => {
    const builder: any = {
      neq: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn().mockResolvedValue({
        data: [
          { id: 'rider-1', name: 'Mark Sheldon Alconaba', mkb_id: 'MKB-101', hub_id: 'hub-1' },
          { id: 'rider-2', name: 'Edemer Malong Jimlan', mkb_id: 'MKB-102', hub_id: 'hub-1' },
        ],
        error: null,
      }),
    };
    return builder;
  };

  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => createQueryBuilder()),
      })),
    },
  };
});

async function flushPromises() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

describe('FMSDailyImport Wizard State Ownership & Navigation', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
  });

  it('renders landing page with grouped snapshots history', async () => {
    await act(async () => {
      root = createRoot(container!);
      root.render(<FMSDailyImport />);
    });
    await flushPromises();

    expect(container?.textContent).toContain('Parcel Data Import');
    expect(container?.textContent).toContain('Import Delivery File');
    expect(container?.textContent).toContain('Recent Import Batches');
    // Grouped snapshots for 2026-08-30 (3 snapshots)
    expect(container?.textContent).toContain('3 snapshots');
  });

  it('reopens staged batch with unmapped rider and resumes at Step 3 (Map Riders)', async () => {
    window.history.replaceState({}, '', '/?batchId=batch-staged-unmapped');

    await act(async () => {
      root = createRoot(container!);
      root.render(<FMSDailyImport />);
    });
    await flushPromises();

    // Should resume at Step 3 (Map Riders) because driver 999999 is unmapped
    expect(container?.textContent).toContain('Map External Drivers');
    expect(container?.textContent).toContain('Needs Mapping: 1');
    expect(container?.textContent).toContain('Unknown Driver');
  });

  it('reopens staged batch with all mapped riders and resumes at Step 4 (Classify)', async () => {
    window.history.replaceState({}, '', '/?batchId=batch-staged-all-mapped');

    await act(async () => {
      root = createRoot(container!);
      root.render(<FMSDailyImport />);
    });
    await flushPromises();

    // Should resume at Step 4 (Classify) because all drivers are mapped
    expect(container?.textContent).toContain('Parcel Classification');
    expect(container?.textContent).toContain('Mark Sheldon');
    expect(container?.textContent).toContain('Edemer Malong Jimlan');
  });

  it('navigates Back from Step 4 to Step 3 and Step 2 without blank page', async () => {
    window.history.replaceState({}, '', '/?batchId=batch-staged-all-mapped');

    await act(async () => {
      root = createRoot(container!);
      root.render(<FMSDailyImport />);
    });
    await flushPromises();

    expect(container?.textContent).toContain('Parcel Classification');

    // Click Back to Step 3
    const backToMapBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Back')
    );
    expect(backToMapBtn).toBeDefined();

    await act(async () => {
      backToMapBtn?.click();
    });
    await flushPromises();

    // Step 3 Map Riders is populated from persisted observations
    expect(container?.textContent).toContain('Map External Drivers');
    expect(container?.textContent).toContain('Mark Sheldon');

    // Click Back to Step 2
    const backToValidateBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Back to Validation')
    );
    expect(backToValidateBtn).toBeDefined();

    await act(async () => {
      backToValidateBtn?.click();
    });
    await flushPromises();

    // Step 2 Validate is populated from activeBatch metadata (not blank!)
    expect(container?.textContent).toContain('Staged File Validation');
    expect(container?.textContent).toContain('Valid / Already Staged');

    // Expand Technical Provenance Details to verify filename and fingerprint
    const techBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Technical Provenance Details')
    );
    expect(techBtn).toBeDefined();
    await act(async () => {
      techBtn?.click();
    });
    await flushPromises();

    expect(container?.textContent).toContain('Afternoon_Fleet.xlsx');
    expect(container?.textContent).toContain('sha-afternoon');
  });

  it('opens confirmed batch in read-only audit mode on Step 6', async () => {
    window.history.replaceState({}, '', '/?batchId=batch-confirmed');

    await act(async () => {
      root = createRoot(container!);
      root.render(<FMSDailyImport />);
    });
    await flushPromises();

    // Should resume at Step 6 in read-only audit mode
    expect(container?.textContent).toContain('Confirm Parcel Results');
    expect(container?.textContent).toContain('This batch is confirmed. All parcel records are finalized and locked in read-only audit mode.');

    // Confirm button in row is disabled
    const confirmBtn = container!.querySelector('button:disabled');
    expect(confirmBtn).not.toBeNull();
  });

  it('resets context cleanly when Start New Import is clicked', async () => {
    window.history.replaceState({}, '', '/?batchId=batch-staged-all-mapped');

    await act(async () => {
      root = createRoot(container!);
      root.render(<FMSDailyImport />);
    });
    await flushPromises();

    // Navigate to Step 1
    const step1Btn = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Upload')
    );
    await act(async () => {
      step1Btn?.click();
    });
    await flushPromises();

    expect(container?.textContent).toContain('Active Staged Import');

    // Click Start New Import
    const startNewBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Start New Import')
    );
    await act(async () => {
      startNewBtn?.click();
    });
    await flushPromises();

    // Should clear active batch and return to fresh upload state
    expect(container?.textContent).not.toContain('Active Staged Import');
    expect(window.location.search).toBe('');
  });

  it('handles invalid or non-existent batchId gracefully by clearing URL and staying on Step 1', async () => {
    window.history.replaceState({}, '', '/?batchId=non-existent-uuid');

    await act(async () => {
      root = createRoot(container!);
      root.render(<FMSDailyImport />);
    });
    await flushPromises();

    expect(container?.textContent).toContain('Import Delivery File');
    expect(window.location.search).toBe('');
  });

  it('opens cancelled batch in read-only audit mode on Step 6', async () => {
    window.history.replaceState({}, '', '/?batchId=batch-cancelled');

    await act(async () => {
      root = createRoot(container!);
      root.render(<FMSDailyImport />);
    });
    await flushPromises();

    expect(container?.textContent).toContain('Confirm Parcel Results');
    expect(container?.textContent).toContain('This batch is cancelled. All parcel records are finalized and locked in read-only audit mode.');
  });

  it('synchronizes Step 1 date input and locks controls to activeBatch authority', async () => {
    window.history.replaceState({}, '', '/?batchId=batch-staged-all-mapped');

    await act(async () => {
      root = createRoot(container!);
      root.render(<FMSDailyImport />);
    });
    await flushPromises();

    // Navigate to Step 1
    const step1Btn = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Upload')
    );
    await act(async () => {
      step1Btn?.click();
    });
    await flushPromises();

    // Date input should reflect activeBatch.business_date ('2026-08-30') and be disabled
    const dateInput = container!.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput).not.toBeNull();
    expect(dateInput.value).toBe('2026-08-30');
    expect(dateInput.disabled).toBe(true);

    // Hub select should reflect activeBatch.hub_id ('hub-1') and be disabled
    const hubSelect = container!.querySelector('select') as HTMLSelectElement;
    expect(hubSelect).not.toBeNull();
    expect(hubSelect.value).toBe('hub-1');
    expect(hubSelect.disabled).toBe(true);
  });
});

