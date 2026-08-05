import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: fromMock },
}));
vi.mock('../lib/apiService', () => ({ logActivity: vi.fn() }));
vi.mock('./parcelService', () => ({
  syncPayrollRecordsFromParcelLogs: vi.fn(),
  getCutoffRangeForDate: vi.fn(() => ({ start: '2026-08-01', end: '2026-08-15' })),
}));

import {
  calculateParcelOperationalMetrics,
  createParcelCorrectionRequest,
  getParcelRateContextForDate,
  resolveStandardRateForTimeIn,
  validateParcelCount,
  validateParcelWorkDate,
  type ParcelRateContext,
} from './operationsService';

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

function metrics(standardRate: number, input = { standard: 20, heavy: 5, failed: 0, returned: 0 }) {
  return calculateParcelOperationalMetrics({
    standardDelivered: input.standard,
    heavyDelivered: input.heavy,
    failed: input.failed,
    returned: input.returned,
    standardRate,
    heavyRate: rates.heavyParcelRate,
  });
}

describe('heavy-aware parcel operations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calculates 20 standard and 5 heavy parcels at the early and heavy rates', () => {
    expect(metrics(12)).toEqual({
      totalDelivered: 25,
      totalHandled: 25,
      deliverySuccessRate: 100,
      standardEarnings: 240,
      heavyEarnings: 85,
      dailyGross: 325,
    });
  });

  it.each([
    ['early', '2026-08-05T00:00:00.000Z', 12, 325],
    ['regular', '2026-08-05T00:30:00.000Z', 11, 305],
    ['late', '2026-08-05T01:30:00.000Z', 10, 285],
  ])('combines the %s attendance rate with the fixed heavy rate', (_label, timeIn, rate, gross) => {
    const resolvedRate = resolveStandardRateForTimeIn(rates, timeIn);
    expect(resolvedRate).toBe(rate);
    expect(metrics(resolvedRate).dailyGross).toBe(gross);
  });

  it('gives failed and returned parcels zero earnings while including them in handled totals', () => {
    const result = metrics(12, { standard: 20, heavy: 5, failed: 3, returned: 2 });
    expect(result.dailyGross).toBe(325);
    expect(result.totalHandled).toBe(30);
    expect(result.deliverySuccessRate).toBe(83.3);
  });

  it('handles zero parcels without division errors', () => {
    expect(metrics(12, { standard: 0, heavy: 0, failed: 0, returned: 0 })).toEqual({
      totalDelivered: 0,
      totalHandled: 0,
      deliverySuccessRate: 0,
      standardEarnings: 0,
      heavyEarnings: 0,
      dailyGross: 0,
    });
  });

  it('treats legacy records as standard parcels when heavy defaults to zero', () => {
    const result = metrics(11, { standard: 20, heavy: 0, failed: 0, returned: 0 });
    expect(result.standardEarnings).toBe(220);
    expect(result.heavyEarnings).toBe(0);
  });

  it('rejects negative, decimal, and future work-date values', () => {
    expect(() => validateParcelCount(-1, 'Heavy Delivered')).toThrow('non-negative whole number');
    expect(() => validateParcelCount(1.5, 'Heavy Delivered')).toThrow('non-negative whole number');
    expect(() => validateParcelWorkDate('2026-08-06', '2026-08-05')).toThrow('not in the future');
  });

  it('looks up the effective configuration for the historical selected date', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'historical', early_standard_rate: 12, regular_standard_rate: 11,
        late_standard_rate: 10, heavy_parcel_rate: 17, heavy_threshold_kg: 4,
        effective_from: '2026-01-01', effective_until: '2026-08-31',
      },
      error: null,
    });
    const chain = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle,
    };
    fromMock.mockReturnValue(chain);

    const result = await getParcelRateContextForDate('2026-08-05');
    expect(result.id).toBe('historical');
    expect(chain.lte).toHaveBeenCalledWith('effective_from', '2026-08-05');
    expect(chain.or).toHaveBeenCalledWith('effective_until.is.null,effective_until.gte.2026-08-05');
  });

  it('uses a future configuration once its effective date becomes the selected work date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T00:00:00.000Z'));
    const chain = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: {
        id: 'future', early_standard_rate: 13, regular_standard_rate: 12, late_standard_rate: 11,
        heavy_parcel_rate: 18, heavy_threshold_kg: 4, effective_from: '2026-09-01', effective_until: null,
      }, error: null }),
    };
    fromMock.mockReturnValue(chain);
    await expect(getParcelRateContextForDate('2026-09-01')).resolves.toMatchObject({ id: 'future', heavyParcelRate: 18 });
    vi.useRealTimers();
  });

  it('fails clearly when no active rate configuration covers the date', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    fromMock.mockReturnValue(chain);
    await expect(getParcelRateContextForDate('2026-08-05')).rejects.toThrow('No active parcel rate configuration');
  });

  it('stores heavy parcel values in correction requests and the append-only audit event', async () => {
    const correctionInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'request-1' }, error: null }) }),
    });
    const auditInsert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockImplementation((table: string) => table === 'parcel_correction_requests'
      ? { insert: correctionInsert }
      : { insert: auditInsert });

    await createParcelCorrectionRequest({
      parcelLogId: 'log-1', riderId: 'rider-1', date: '2026-08-05',
      previousDelivered: 20, previousHeavy: 2, previousFailed: 1, previousReturned: 0,
      requestedDelivered: 20, requestedHeavy: 5, requestedFailed: 1, requestedReturned: 0,
      reason: 'Weighing records corrected', requestedBy: 'not-a-uuid',
    });

    expect(correctionInsert).toHaveBeenCalledWith(expect.objectContaining({ previous_heavy: 2, requested_heavy: 5 }));
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ old_heavy: 2, new_heavy: 5 }));
  });
});
