import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getParcelRateContextForDate,
  resolveStandardRateForTimeIn,
  resolveRateTierInfo,
  type ParcelRateContext,
} from './parcelOperationsPolicy';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: fromMock },
}));

vi.mock('../attendance/attendanceService', () => ({
  getLocalDateString: (date?: Date) => {
    if (!date) return '2026-10-01';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },
}));

const rates: ParcelRateContext = {
  id: 'rate-config-1',
  earlyStandardRate: 12,
  regularStandardRate: 11,
  lateStandardRate: 10,
  heavyParcelRate: 17,
  heavyThresholdKg: 4,
  effectiveFrom: '2026-01-01',
  effectiveUntil: null,
};

describe('parcel operations rate policy characterization', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['exactly 08:00', '08:00', 12],
    ['08:01', '08:01', 11],
    ['exactly 09:00', '09:00', 11],
    ['09:01', '09:01', 10],
  ])('uses the existing rate at %s', (_label, timeIn, expectedRate) => {
    expect(resolveStandardRateForTimeIn(rates, timeIn)).toBe(expectedRate);
  });

  it('converts timestamps through Asia/Manila before selecting the rate', () => {
    expect(resolveStandardRateForTimeIn(rates, '2026-08-05T00:00:00.000Z')).toBe(12);
    expect(resolveStandardRateForTimeIn(rates, '2026-08-05T00:01:00.000Z')).toBe(11);
    expect(resolveStandardRateForTimeIn(rates, '2026-08-05T01:00:00.000Z')).toBe(11);
    expect(resolveStandardRateForTimeIn(rates, '2026-08-05T01:01:00.000Z')).toBe(10);
  });

  it.each([
    ['missing', null],
    ['undefined', undefined],
    ['invalid', 'not-a-time'],
  ])('returns null for %s Time In', (_label, timeIn) => {
    expect(resolveStandardRateForTimeIn(rates, timeIn)).toBeNull();
  });

  it('provides complete rate tier metadata through resolveRateTierInfo', () => {
    expect(resolveRateTierInfo(rates, '07:55')).toEqual({ rate: 12, tier: 'early', label: 'Early Standard' });
    expect(resolveRateTierInfo(rates, '08:30')).toEqual({ rate: 11, tier: 'regular', label: 'Regular Standard' });
    expect(resolveRateTierInfo(rates, '09:15')).toEqual({ rate: 10, tier: 'late', label: 'Late Standard' });
    expect(resolveRateTierInfo(rates, null)).toEqual({ rate: null, tier: 'missing', label: 'Missing Attendance' });
  });

  it('selects the active historical configuration covering the work date', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'historical',
        early_standard_rate: 12,
        regular_standard_rate: 11,
        late_standard_rate: 10,
        heavy_parcel_rate: 17,
        heavy_threshold_kg: 4,
        effective_from: '2026-01-01',
        effective_until: '2026-08-31',
      },
      error: null,
    });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle,
    };
    fromMock.mockReturnValue(query);
    await expect(getParcelRateContextForDate('2026-08-05')).resolves.toMatchObject({
      id: 'historical',
      effectiveFrom: '2026-01-01',
      effectiveUntil: '2026-08-31',
    });
    expect(fromMock).toHaveBeenCalledWith('parcel_rate_configurations');
    expect(query.eq).toHaveBeenCalledWith('active', true);
    expect(query.lte).toHaveBeenCalledWith('effective_from', '2026-08-05');
    expect(query.or).toHaveBeenCalledWith('effective_until.is.null,effective_until.gte.2026-08-05');
    expect(query.order).toHaveBeenCalledWith('effective_from', { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(1);
  });

  it('selects a future configuration once its effective date is the work date', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'future',
          early_standard_rate: 13,
          regular_standard_rate: 12,
          late_standard_rate: 11,
          heavy_parcel_rate: 18,
          heavy_threshold_kg: 4,
          effective_from: '2026-09-01',
          effective_until: null,
        },
        error: null,
      }),
    };
    fromMock.mockReturnValue(query);
    await expect(getParcelRateContextForDate('2026-09-01')).resolves.toMatchObject({
      id: 'future',
      heavyParcelRate: 18,
      effectiveFrom: '2026-09-01',
    });
  });

  it('preserves the missing-configuration error', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    fromMock.mockReturnValue(query);
    await expect(getParcelRateContextForDate('2026-08-05'))
      .rejects.toThrow('No active parcel rate configuration exists for 2026-08-05.');
  });
});
