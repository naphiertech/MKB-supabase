import { describe, expect, it } from 'vitest';
import { getPayrollWeek } from '../payroll/payrollCalendar';
import { buildRiderParcelPeriodView, type RiderParcelRawLog } from './riderParcelsModel';

const period = getPayrollWeek('2026-10-27');

function makeLog(overrides: Partial<RiderParcelRawLog> = {}): RiderParcelRawLog {
  return {
    id: 'log-1',
    rider_id: 'rider-1',
    date: '2026-10-27',
    parcels: 80,
    heavy_parcels: 6,
    assigned_parcels: 100,
    failed_parcels: 4,
    returned_parcels: 2,
    rate: 12,
    heavy_rate: 25,
    standard_earnings: 960,
    heavy_earnings: 150,
    daily_gross: 1110,
    notes: 'FMS Confirmed: 999001',
    updated_at: '2026-10-27T09:00:00Z',
    ...overrides,
  };
}

describe('buildRiderParcelPeriodView', () => {
  it('sorts daily rows newest-first, classifies source, joins attendance Time-In, and aggregates KPIs', () => {
    const view = buildRiderParcelPeriodView({
      period,
      logs: [
        makeLog({
          id: 'log-mon',
          date: '2026-10-26',
          parcels: 50,
          heavy_parcels: 0,
          assigned_parcels: 60,
          failed_parcels: 5,
          returned_parcels: 0,
          rate: 11,
          heavy_rate: 25,
          standard_earnings: 550,
          heavy_earnings: 0,
          daily_gross: 550,
          notes: null,
        }),
        makeLog({ id: 'log-tue', date: '2026-10-27' }),
      ],
      attendanceLogs: [
        { date: '2026-10-27', time_in: '2026-10-27T00:15:00Z', status: 'present' },
        { date: '2026-10-26', time_in: '2026-10-26T00:45:00Z', status: 'late' },
      ],
      payrollStatus: 'draft',
    });

    expect(view.status).toEqual({
      code: 'pre_payroll',
      label: 'Pre-Payroll (Live)',
      isFinalized: false,
    });
    expect(view.days.map((d) => d.date)).toEqual(['2026-10-27', '2026-10-26']);

    expect(view.days[0].source).toBe('fms_import');
    expect(view.days[0].totalDelivered).toBe(86);
    expect(view.days[0].successRate).toBe(86);
    expect(view.days[0].timeInLabel).toContain('8:15');

    expect(view.days[1].source).toBe('manual');
    expect(view.days[1].totalDelivered).toBe(50);

    expect(view.summary).toEqual({
      totalDelivered: 136,
      standardDelivered: 130,
      heavyDelivered: 6,
      assigned: 160,
      failed: 9,
      returned: 2,
      successRate: 85,
      standardEarnings: 1510,
      heavyEarnings: 150,
      totalDeliveryGross: 1660,
      activeDays: 2,
    });
  });

  it('falls back to delivered/(delivered+failed+returned) success rate when assigned is absent', () => {
    const view = buildRiderParcelPeriodView({
      period,
      logs: [
        makeLog({
          parcels: 15,
          heavy_parcels: 3,
          assigned_parcels: null,
          failed_parcels: 2,
          returned_parcels: 0,
          standard_earnings: null,
          heavy_earnings: null,
          daily_gross: null,
        }),
      ],
      payrollStatus: 'approved',
    });

    expect(view.status).toEqual({ code: 'approved', label: 'Approved', isFinalized: true });
    expect(view.days[0].assigned).toBeNull();
    expect(view.days[0].successRate).toBe(90); // 18 / (18 + 2)
    expect(view.days[0].dailyGross).toBe(255); // 15*12 + 3*25
    expect(view.summary.assigned).toBeNull();
    expect(view.summary.successRate).toBe(90);
    expect(view.summary.totalDeliveryGross).toBe(255);
  });

  it('maps empty periods and offline snapshot metadata cleanly', () => {
    const view = buildRiderParcelPeriodView({
      period,
      logs: [],
      payrollStatus: 'paid',
      isOfflineSnapshot: true,
      cachedAt: 1730000000000,
    });

    expect(view.status).toEqual({ code: 'paid', label: 'Paid', isFinalized: true });
    expect(view.summary.activeDays).toBe(0);
    expect(view.summary.successRate).toBeNull();
    expect(view.summary.totalDeliveryGross).toBe(0);
    expect(view.isOfflineSnapshot).toBe(true);
    expect(view.cachedAt).toBe(1730000000000);
  });
});
