import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPayrollWeek } from '../../lib/payroll/payrollCalendar';

const store = new Map<string, unknown>();

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: mocks.from,
  },
}));

vi.mock('../../lib/storage', () => ({
  getStorageAdapter: () => ({
    getItem: async <T,>(key: string) => (store.has(key) ? (store.get(key) as T) : null),
    setItem: async (key: string, value: unknown) => {
      store.set(key, value);
    },
    removeItem: async (key: string) => {
      store.delete(key);
    },
    getAllKeys: async () => Array.from(store.keys()),
  }),
}));

import { clearRiderParcelCache, loadRiderParcelPeriod } from './riderParcelService';

const period = getPayrollWeek('2026-10-27');

function mockSupabaseResponses(opts: {
  parcelResult: { data: unknown; error: unknown };
  attendanceResult?: { data: unknown; error: unknown };
  payrollResult?: { data: unknown; error: unknown };
}) {
  mocks.from.mockImplementation((table: string) => {
    if (table === 'parcel_logs') {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue(opts.parcelResult),
      };
      return chain;
    }
    if (table === 'attendance_logs') {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockResolvedValue(opts.attendanceResult ?? { data: [], error: null }),
      };
      return chain;
    }
    if (table === 'payroll_records') {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue(opts.payrollResult ?? { data: null, error: null }),
      };
      return chain;
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

describe('riderParcelService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
  });

  it('fetches parcel_logs, attendance_logs, and payroll_records in parallel and caches the snapshot', async () => {
    mockSupabaseResponses({
      parcelResult: {
        data: [
          {
            id: 'log-1',
            rider_id: 'rider-1',
            date: '2026-10-27',
            parcels: 40,
            heavy_parcels: 5,
            assigned_parcels: 50,
            failed_parcels: 5,
            returned_parcels: 0,
            rate: 12,
            heavy_rate: 25,
            standard_earnings: 480,
            heavy_earnings: 125,
            daily_gross: 605,
            notes: 'FMS Confirmed: 999001',
            updated_at: '2026-10-27T08:00:00Z',
          },
        ],
        error: null,
      },
      attendanceResult: {
        data: [{ date: '2026-10-27', time_in: '2026-10-27T00:05:00Z', status: 'present' }],
        error: null,
      },
      payrollResult: {
        data: { status: 'approved' },
        error: null,
      },
    });

    const view = await loadRiderParcelPeriod({ userId: 'user-1', riderId: 'rider-1', period });

    expect(view.isOfflineSnapshot).toBe(false);
    expect(view.status.code).toBe('approved');
    expect(view.summary.totalDelivered).toBe(45);
    expect(view.summary.totalDeliveryGross).toBe(605);
    expect(view.days[0].source).toBe('fms_import');
    expect(view.days[0].timeInLabel).toContain('8:05');
    expect(store.size).toBe(1);
  });

  it('falls back to cached offline snapshot on network error and clears cleanly on sign-out', async () => {
    mockSupabaseResponses({
      parcelResult: {
        data: [
          {
            id: 'log-1',
            rider_id: 'rider-1',
            date: '2026-10-27',
            parcels: 20,
            heavy_parcels: 2,
            assigned_parcels: 25,
            failed_parcels: 3,
            returned_parcels: 0,
            rate: 11,
            heavy_rate: 25,
            standard_earnings: 220,
            heavy_earnings: 50,
            daily_gross: 270,
            notes: null,
            updated_at: '2026-10-27T08:00:00Z',
          },
        ],
        error: null,
      },
    });

    await loadRiderParcelPeriod({ userId: 'user-1', riderId: 'rider-1', period });

    mockSupabaseResponses({
      parcelResult: { data: null, error: new Error('Network offline') },
    });

    const offlineView = await loadRiderParcelPeriod({ userId: 'user-1', riderId: 'rider-1', period });
    expect(offlineView.isOfflineSnapshot).toBe(true);
    expect(offlineView.summary.totalDelivered).toBe(22);

    await clearRiderParcelCache('user-1', 'rider-1');
    expect(store.size).toBe(0);

    await expect(
      loadRiderParcelPeriod({ userId: 'user-1', riderId: 'rider-1', period }),
    ).rejects.toThrow('Network offline');
  });
});
