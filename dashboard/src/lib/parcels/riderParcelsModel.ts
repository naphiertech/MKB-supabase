import type { PayrollWeekPeriod } from '../payroll/payrollCalendar';

export type RiderParcelSource = 'fms_import' | 'manual';

export type RiderParcelPeriodStatusCode = 'pre_payroll' | 'pending' | 'approved' | 'paid';

export interface RiderParcelRawLog {
  id: string;
  rider_id: string;
  date: string;
  parcels: number;
  heavy_parcels: number;
  assigned_parcels: number | null;
  failed_parcels: number | null;
  returned_parcels: number | null;
  rate: number;
  heavy_rate: number | null;
  standard_earnings: number | null;
  heavy_earnings: number | null;
  daily_gross: number | null;
  notes: string | null;
  updated_at: string | null;
}

export interface RiderParcelAttendanceHint {
  date: string;
  time_in: string | null;
  status: string | null;
}

export interface RiderParcelDailyEntry {
  id: string;
  date: string;
  standardDelivered: number;
  heavyDelivered: number;
  totalDelivered: number;
  assigned: number | null;
  failed: number;
  returned: number;
  successRate: number | null;
  standardRate: number;
  heavyRate: number;
  standardEarnings: number;
  heavyEarnings: number;
  dailyGross: number;
  source: RiderParcelSource;
  notes: string | null;
  updatedAt: string | null;
  timeInLabel: string | null;
  attendanceStatus: string | null;
}

export interface RiderParcelPeriodSummary {
  totalDelivered: number;
  standardDelivered: number;
  heavyDelivered: number;
  assigned: number | null;
  failed: number;
  returned: number;
  successRate: number | null;
  standardEarnings: number;
  heavyEarnings: number;
  totalDeliveryGross: number;
  activeDays: number;
}

export interface RiderParcelPeriodStatus {
  code: RiderParcelPeriodStatusCode;
  label: string;
  isFinalized: boolean;
}

export interface RiderParcelPeriodView {
  period: PayrollWeekPeriod;
  status: RiderParcelPeriodStatus;
  summary: RiderParcelPeriodSummary;
  days: RiderParcelDailyEntry[];
  isOfflineSnapshot: boolean;
  cachedAt: number | null;
}

export interface BuildRiderParcelPeriodInput {
  period: PayrollWeekPeriod;
  logs: RiderParcelRawLog[];
  attendanceLogs?: RiderParcelAttendanceHint[];
  payrollStatus?: string | null;
  isOfflineSnapshot?: boolean;
  cachedAt?: number | null;
}

function toSafeNumber(value: number | string | null | undefined): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeSuccessRate(
  totalDelivered: number,
  assigned: number | null,
  failed: number,
  returned: number,
): number | null {
  if (assigned !== null && assigned > 0) {
    return Math.min(100, Math.round((totalDelivered / assigned) * 100));
  }
  const denominator = totalDelivered + failed + returned;
  if (denominator <= 0) return null;
  return Math.round((totalDelivered / denominator) * 100);
}

function formatManilaTimeIn(isoOrTime: string | null | undefined): string | null {
  if (!isoOrTime) return null;
  const trimmed = isoOrTime.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }
  return parsed.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila',
  });
}

function classifyParcelSource(notes: string | null | undefined): RiderParcelSource {
  if (!notes) return 'manual';
  return /^fms\s+confirmed:/i.test(notes.trim()) ? 'fms_import' : 'manual';
}

function resolveParcelPeriodStatus(payrollStatus: string | null | undefined): RiderParcelPeriodStatus {
  const normalized = String(payrollStatus ?? '').trim().toLowerCase();
  if (normalized === 'paid') {
    return { code: 'paid', label: 'Paid', isFinalized: true };
  }
  if (normalized === 'approved') {
    return { code: 'approved', label: 'Approved', isFinalized: true };
  }
  if (normalized === 'pending') {
    return { code: 'pending', label: 'Pending Review', isFinalized: false };
  }
  return { code: 'pre_payroll', label: 'Pre-Payroll (Live)', isFinalized: false };
}

/**
 * Pure domain projection for the Rider "My Parcels" transparency module.
 * Normalizes daily parcel_logs, joins morning Time-In context, classifies entry source,
 * and computes cutoff-period KPIs and payroll finalization state.
 */
export function buildRiderParcelPeriodView(
  input: BuildRiderParcelPeriodInput,
): RiderParcelPeriodView {
  const attendanceByDate = new Map<string, RiderParcelAttendanceHint>();
  for (const att of input.attendanceLogs ?? []) {
    if (att.date) {
      attendanceByDate.set(att.date, att);
    }
  }

  const days: RiderParcelDailyEntry[] = [...input.logs]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((log) => {
      const standardDelivered = Math.max(0, toSafeNumber(log.parcels));
      const heavyDelivered = Math.max(0, toSafeNumber(log.heavy_parcels));
      const totalDelivered = standardDelivered + heavyDelivered;
      const assigned = log.assigned_parcels == null ? null : Math.max(0, toSafeNumber(log.assigned_parcels));
      const failed = Math.max(0, toSafeNumber(log.failed_parcels));
      const returned = Math.max(0, toSafeNumber(log.returned_parcels));
      const standardRate = toSafeNumber(log.rate);
      const heavyRate = toSafeNumber(log.heavy_rate);
      const standardEarnings = roundCurrency(
        log.standard_earnings != null
          ? toSafeNumber(log.standard_earnings)
          : standardDelivered * standardRate,
      );
      const heavyEarnings = roundCurrency(
        log.heavy_earnings != null
          ? toSafeNumber(log.heavy_earnings)
          : heavyDelivered * heavyRate,
      );
      const dailyGross = roundCurrency(
        log.daily_gross != null
          ? toSafeNumber(log.daily_gross)
          : standardEarnings + heavyEarnings,
      );
      const attendance = attendanceByDate.get(log.date);

      return {
        id: log.id,
        date: log.date,
        standardDelivered,
        heavyDelivered,
        totalDelivered,
        assigned,
        failed,
        returned,
        successRate: computeSuccessRate(totalDelivered, assigned, failed, returned),
        standardRate,
        heavyRate,
        standardEarnings,
        heavyEarnings,
        dailyGross,
        source: classifyParcelSource(log.notes),
        notes: log.notes,
        updatedAt: log.updated_at,
        timeInLabel: formatManilaTimeIn(attendance?.time_in),
        attendanceStatus: attendance?.status ?? null,
      };
    });

  let standardDelivered = 0;
  let heavyDelivered = 0;
  let failed = 0;
  let returned = 0;
  let assignedSum = 0;
  let hasAssigned = false;
  let standardEarnings = 0;
  let heavyEarnings = 0;
  let totalDeliveryGross = 0;

  for (const day of days) {
    standardDelivered += day.standardDelivered;
    heavyDelivered += day.heavyDelivered;
    failed += day.failed;
    returned += day.returned;
    if (day.assigned !== null) {
      hasAssigned = true;
      assignedSum += day.assigned;
    }
    standardEarnings += day.standardEarnings;
    heavyEarnings += day.heavyEarnings;
    totalDeliveryGross += day.dailyGross;
  }

  const totalDelivered = standardDelivered + heavyDelivered;
  const assigned = hasAssigned ? assignedSum : null;

  return {
    period: input.period,
    status: resolveParcelPeriodStatus(input.payrollStatus),
    summary: {
      totalDelivered,
      standardDelivered,
      heavyDelivered,
      assigned,
      failed,
      returned,
      successRate: computeSuccessRate(totalDelivered, assigned, failed, returned),
      standardEarnings: roundCurrency(standardEarnings),
      heavyEarnings: roundCurrency(heavyEarnings),
      totalDeliveryGross: roundCurrency(totalDeliveryGross),
      activeDays: days.length,
    },
    days,
    isOfflineSnapshot: Boolean(input.isOfflineSnapshot),
    cachedAt: input.cachedAt ?? null,
  };
}
