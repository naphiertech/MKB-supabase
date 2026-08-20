import { supabase } from '../lib/supabaseClient';
import { logActivity } from '../lib/apiService';
import { PayrollStatus } from '../types/payroll';
import { dispatchNotificationSafe } from './notificationService';
import {
  bulkApprovePayrollRecords,
  bulkMarkPayrollRecordsPaid,
} from './payrollBulkActions';
import { resolveAttendanceSummaryFacts } from './attendanceSummaryPolicy';

export interface ParcelLog {
  id: string;
  riderId: string;
  date: string;
  parcels: number;
  heavyParcels: number;
  assignedParcels: number | null;
  failedParcels: number;
  returnedParcels: number;
  rate: number;
  heavyRate: number;
  standardEarnings: number;
  heavyEarnings: number;
  dailyGross: number;
  rateConfigurationId: string | null;
  calculationVersion: number;
  source: 'live' | 'snapshot';
}

export interface OperationalParcelSummary {
  delivered: number;
  standardDelivered: number;
  heavyDelivered: number;
  failed: number;
  returned: number;
  totalHandled: number;
  assigned: number | null;
  successRate: number | null;
  standardEarnings: number;
  heavyEarnings: number;
  grossDeliveryPay: number;
  rateConfigurationIds: string[];
}

export interface PayrollSnapshotRecordLike {
  id: string;
  rider_id: string;
  cutoff_start: string;
  cutoff_end: string;
  status: string;
  total_parcels?: number | null;
  standard_parcels?: number | null;
  heavy_parcels?: number | null;
  standard_earnings?: number | null;
  heavy_earnings?: number | null;
  gross_pay?: number | null;
  rate_configuration_id?: string | null;
  calculation_version?: number | null;
  snapshot_finalized_at?: string | null;
}

export interface PayrollDeliveryData {
  lines: ParcelLog[];
  summary: OperationalParcelSummary;
  source: 'live' | 'snapshot' | 'legacy';
  calculationVersion: number;
}

export class MissingPayrollSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingPayrollSnapshotError';
  }
}

export interface ParcelSummary {
  totalParcels: number;
  grossPay: number;
  rate: number;
  days: ParcelLog[];
}

// Get all parcel logs for a rider within a cutoff period
export const getParcelLogs = async (
  riderId: string,
  cutoffFrom: string,
  cutoffTo: string
): Promise<ParcelLog[]> => {
  const { data, error } = await supabase
    .from('parcel_logs')
    .select('id, rider_id, date, parcels, heavy_parcels, assigned_parcels, failed_parcels, returned_parcels, rate, heavy_rate, standard_earnings, heavy_earnings, daily_gross, rate_configuration_id')
    .eq('rider_id', riderId)
    .gte('date', cutoffFrom)
    .lte('date', cutoffTo)
    .order('date', { ascending: true });

  if (error) throw error;

  return (data ?? []).map(row => ({
    id: row.id,
    riderId: row.rider_id,
    date: row.date,
    parcels: Number(row.parcels ?? 0),
    heavyParcels: Number(row.heavy_parcels ?? 0),
    assignedParcels: row.assigned_parcels == null ? null : Number(row.assigned_parcels),
    failedParcels: Number(row.failed_parcels ?? 0),
    returnedParcels: Number(row.returned_parcels ?? 0),
    rate: row.rate == null ? Number.NaN : Number(row.rate),
    heavyRate: row.heavy_rate == null ? Number.NaN : Number(row.heavy_rate),
    standardEarnings: Number(row.standard_earnings ?? 0),
    heavyEarnings: Number(row.heavy_earnings ?? 0),
    dailyGross: Number(row.daily_gross ?? 0),
    rateConfigurationId: row.rate_configuration_id ?? null,
    calculationVersion: 2,
    source: 'live' as const,
  }));
};

export const calculateDeliverySuccessRate = (
  delivered: number,
  assigned: number | null
): number | null => {
  if (assigned == null || assigned <= 0) return null;
  return Math.round((delivered / assigned) * 1000) / 10;
};

export const summarizeOperationalParcels = (
  logs: ParcelLog[]
): OperationalParcelSummary => {
  const standardDelivered = logs.reduce((sum, log) => sum + log.parcels, 0);
  const heavyDelivered = logs.reduce((sum, log) => sum + log.heavyParcels, 0);
  const delivered = standardDelivered + heavyDelivered;
  const failed = logs.reduce((sum, log) => sum + log.failedParcels, 0);
  const returned = logs.reduce((sum, log) => sum + log.returnedParcels, 0);
  const totalHandled = delivered + failed + returned;
  const logsWithAssigned = logs.filter((log) => log.assignedParcels != null);
  const assigned = logsWithAssigned.length > 0
    ? logsWithAssigned.reduce((sum, log) => sum + (log.assignedParcels ?? 0), 0)
    : null;

  return {
    delivered,
    standardDelivered,
    heavyDelivered,
    failed,
    returned,
    totalHandled,
    assigned,
    successRate: totalHandled > 0 ? Math.round((delivered / totalHandled) * 1000) / 10 : 0,
    standardEarnings: logs.reduce((sum, log) => sum + log.standardEarnings, 0),
    heavyEarnings: logs.reduce((sum, log) => sum + log.heavyEarnings, 0),
    grossDeliveryPay: logs.reduce((sum, log) => sum + log.dailyGross, 0),
    rateConfigurationIds: Array.from(new Set(logs.map(log => log.rateConfigurationId).filter((id): id is string => Boolean(id)))),
  };
};

export function validatePayrollDeliveryLine(line: ParcelLog): void {
  if (!Number.isFinite(line.rate) || line.rate < 0) {
    throw new MissingPayrollSnapshotError(`Standard rate snapshot is missing for ${line.date}. Review the operational record before submission.`);
  }
  if (!Number.isFinite(line.heavyRate) || line.heavyRate < 0) {
    throw new MissingPayrollSnapshotError(`Heavy rate snapshot is missing for ${line.date}. Review the operational record before submission.`);
  }
  if (!line.rateConfigurationId) {
    throw new MissingPayrollSnapshotError(`Rate configuration reference is missing for ${line.date}. Review the operational record before submission.`);
  }
  const numericValues = [line.parcels, line.heavyParcels, line.failedParcels, line.returnedParcels, line.standardEarnings, line.heavyEarnings, line.dailyGross];
  if (numericValues.some(value => !Number.isFinite(value) || value < 0)) {
    throw new MissingPayrollSnapshotError(`Delivery snapshot amounts are incomplete for ${line.date}. Review the operational record before submission.`);
  }
}

function legacySummary(record: PayrollSnapshotRecordLike): OperationalParcelSummary {
  const standardDelivered = Number(record.standard_parcels ?? record.total_parcels ?? 0);
  const heavyDelivered = Number(record.heavy_parcels ?? 0);
  const standardEarnings = Number(record.standard_earnings ?? record.gross_pay ?? 0);
  const heavyEarnings = Number(record.heavy_earnings ?? 0);
  return {
    delivered: standardDelivered + heavyDelivered,
    standardDelivered,
    heavyDelivered,
    failed: 0,
    returned: 0,
    totalHandled: standardDelivered + heavyDelivered,
    assigned: null,
    successRate: standardDelivered + heavyDelivered > 0 ? 100 : 0,
    standardEarnings,
    heavyEarnings,
    grossDeliveryPay: Number(record.gross_pay ?? standardEarnings + heavyEarnings),
    rateConfigurationIds: record.rate_configuration_id ? [record.rate_configuration_id] : [],
  };
}

export async function getPayrollDeliveryData(record: PayrollSnapshotRecordLike): Promise<PayrollDeliveryData> {
  const calculationVersion = Number(record.calculation_version ?? 1);
  const isLegacy = calculationVersion === 1;
  const isWorking = record.status === PayrollStatus.DRAFT || record.status === PayrollStatus.REJECTED;

  if (isLegacy && !isWorking) {
    return { lines: [], summary: legacySummary(record), source: 'legacy', calculationVersion };
  }

  if (isWorking) {
    const lines = await getParcelLogs(record.rider_id, record.cutoff_start, record.cutoff_end);
    lines.forEach(validatePayrollDeliveryLine);
    return { lines, summary: summarizeOperationalParcels(lines), source: 'live', calculationVersion: 2 };
  }

  const { data, error } = await supabase
    .from('payroll_delivery_lines')
    .select('id, payroll_record_id, rider_id, date, standard_delivered, heavy_delivered, failed, returned, applied_standard_rate, applied_heavy_rate, standard_earnings, heavy_earnings, gross_delivery_pay, rate_configuration_id, calculation_version')
    .eq('payroll_record_id', record.id)
    .order('date', { ascending: true });

  if (error) throw error;
  const lines: ParcelLog[] = (data ?? []).map(row => ({
    id: row.id,
    riderId: row.rider_id,
    date: row.date,
    parcels: Number(row.standard_delivered),
    heavyParcels: Number(row.heavy_delivered),
    assignedParcels: null,
    failedParcels: Number(row.failed),
    returnedParcels: Number(row.returned),
    rate: row.applied_standard_rate == null ? Number.NaN : Number(row.applied_standard_rate),
    heavyRate: row.applied_heavy_rate == null ? Number.NaN : Number(row.applied_heavy_rate),
    standardEarnings: Number(row.standard_earnings),
    heavyEarnings: Number(row.heavy_earnings),
    dailyGross: Number(row.gross_delivery_pay),
    rateConfigurationId: row.rate_configuration_id,
    calculationVersion: Number(row.calculation_version),
    source: 'snapshot',
  }));

  if (lines.length === 0) {
    const hasNoDelivery = Number(record.total_parcels ?? 0) === 0 && Number(record.gross_pay ?? 0) === 0;
    if (!hasNoDelivery) {
      throw new MissingPayrollSnapshotError('This finalized payroll is missing its immutable delivery lines. Review is required; live records will not be used.');
    }
  }
  lines.forEach(validatePayrollDeliveryLine);
  return { lines, summary: summarizeOperationalParcels(lines), source: 'snapshot', calculationVersion };
}

// Upsert a single day parcel entry
// Updates if exists, inserts if not
export const upsertParcelLog = async (
  riderId: string,
  date: string,
  parcels: number,
  rate: number,
  createdBy: string
): Promise<void> => {
  const { error } = await supabase
    .from('parcel_logs')
    .upsert(
      {
        rider_id: riderId,
        date,
        parcels,
        rate,
        created_by: createdBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'rider_id,date' }
    );

  if (error) throw error;

  try {
    const { cutoffFrom, cutoffTo } = getCutoffRangeForDate(date);
    await syncPayrollRecordsFromParcelLogs(cutoffFrom, cutoffTo);
  } catch (syncErr) {
    console.warn('Post-upsert log payroll sync warning:', syncErr);
  }
};

// Compute summary from logs
export const computeParcelSummary = (
  logs: ParcelLog[],
  rate: number
): ParcelSummary => {
  const totalParcels = logs.reduce((sum, l) => sum + l.parcels, 0);
  return {
    totalParcels,
    grossPay: totalParcels * rate,
    rate,
    days: logs,
  };
};

// Save finalized payroll record for a rider (defaults status to draft)
export const savePayrollRecord = async (
  riderId: string,
  cutoffFrom: string,
  cutoffTo: string
): Promise<void> => {
  await syncPayrollRecordsFromParcelLogs(cutoffFrom, cutoffTo, { allowCreateMissing: true });
  const { data: savedRecord, error } = await supabase
    .from('payroll_records')
    .select('id, total_parcels, gross_pay, status')
    .eq('rider_id', riderId)
    .eq('cutoff_start', cutoffFrom)
    .single();

  if (error) throw error;
  if (!savedRecord || (savedRecord.status !== PayrollStatus.DRAFT && savedRecord.status !== PayrollStatus.REJECTED)) {
    throw new Error('Only Draft or Rejected payroll records can synchronize from Parcel Operations.');
  }
  const finalGross = Number(savedRecord.gross_pay ?? 0);
  const totalParcels = Number(savedRecord.total_parcels ?? 0);

  // Retrieve rider details to create a descriptive activity log
  try {
    const { data: rider } = await supabase
      .from('riders')
      .select('name')
      .eq('id', riderId)
      .single();

    const riderName = rider?.name || 'Rider';

    await logActivity({
      riderId,
      eventType: 'payroll_finalize',
      description: `Finalized payroll worksheet (Draft) for ${riderName} (${cutoffFrom} to ${cutoffTo}) - Net Pay: ₱${finalGross.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      metadata: {
        cutoff_start: cutoffFrom,
        cutoff_end: cutoffTo,
        total_parcels: totalParcels,
        gross_pay: finalGross,
        status: PayrollStatus.DRAFT
      }
    });
  } catch (logErr) {
    console.warn('Failed to log payroll finalize activity:', logErr);
  }
};

/**
 * Initializes draft payroll records for all active riders for a specific cutoff period.
 * Idempotent: Skips riders that already have a payroll record for the given cutoff.
 */
export const initializeCutoffPayrollForFleet = async (
  cutoffFrom: string,
  cutoffTo: string,
  userId?: string
): Promise<{ initializedCount: number; totalRiders: number }> => {
  // 1. Resolve date-effective employment eligibility authoritatively. This is
  // the intentional creation path; pure payroll reads remain unchanged.
  const { data: eligibleRows, error: eligibilityError } = await supabase.rpc('get_payroll_eligible_rider_ids', {
    p_cutoff_start: cutoffFrom,
    p_cutoff_end: cutoffTo,
  });
  if (eligibilityError) throw eligibilityError;
  const eligibleIds = (eligibleRows || []).map((row: { rider_id: string }) => row.rider_id);
  if (eligibleIds.length === 0) return { initializedCount: 0, totalRiders: 0 };

  const { data: riders, error: riderErr } = await supabase
    .from('riders')
    .select('id, name')
    .in('id', eligibleIds);

  if (riderErr) throw riderErr;
  if (!riders || riders.length === 0) {
    return { initializedCount: 0, totalRiders: 0 };
  }

  // 2. Fetch existing payroll records for this cutoff period
  const { data: existingRecords, error: recordErr } = await supabase
    .from('payroll_records')
    .select('rider_id')
    .eq('cutoff_start', cutoffFrom);

  if (recordErr) throw recordErr;

  const existingRiderIds = new Set((existingRecords || []).map(r => r.rider_id));

  // 3. Filter riders missing payroll records
  const missingRiders = riders.filter(r => !existingRiderIds.has(r.id));

  if (missingRiders.length === 0) {
    return { initializedCount: 0, totalRiders: riders.length };
  }

  // 4. Batch insert missing draft payroll records
  const newRecords = missingRiders.map(r => ({
    rider_id: r.id,
    cutoff_start: cutoffFrom,
    cutoff_end: cutoffTo,
    total_parcels: 0,
    rate_per_parcel: 10,
    gross_pay: 0,
    status: PayrollStatus.DRAFT,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    submitted_by: userId || null
  }));

  const { error: insertErr } = await supabase
    .from('payroll_records')
    .upsert(newRecords, { onConflict: 'rider_id,cutoff_start' });

  if (insertErr) throw insertErr;

  // Immediately hydrate newly created draft records from parcel_logs
  await syncPayrollRecordsFromParcelLogs(cutoffFrom, cutoffTo, { allowCreateMissing: false });

  return {
    initializedCount: missingRiders.length,
    totalRiders: riders.length
  };
};

export interface CutoffPreparationCoverage {
  totalEligible: number;
  preparedCount: number;
  missingCount: number;
  state: 'no_riders' | 'unprepared' | 'partial' | 'ready';
}

/**
 * Checks coverage-based preparation readiness for a cutoff period and Hub scope.
 * Determines how many eligible active riders already have payroll records.
 */
export const getCutoffPreparationCoverage = async (
  cutoffFrom: string,
  cutoffTo: string,
  hubId?: string | null
): Promise<CutoffPreparationCoverage> => {
  // 1. Resolve date-effective employment eligibility authoritatively
  const { data: eligibleRows, error: eligibilityError } = await supabase.rpc('get_payroll_eligible_rider_ids', {
    p_cutoff_start: cutoffFrom,
    p_cutoff_end: cutoffTo,
  });
  if (eligibilityError) throw eligibilityError;
  const eligibleIds = (eligibleRows || []).map((row: { rider_id: string }) => row.rider_id);
  if (eligibleIds.length === 0) {
    return { totalEligible: 0, preparedCount: 0, missingCount: 0, state: 'no_riders' };
  }

  // 2. Fetch scoped riders
  let riderQuery = supabase
    .from('riders')
    .select('id, hub_id')
    .in('id', eligibleIds);

  if (hubId) {
    riderQuery = riderQuery.eq('hub_id', hubId);
  }

  const { data: riders, error: riderErr } = await riderQuery;
  if (riderErr) throw riderErr;
  if (!riders || riders.length === 0) {
    return { totalEligible: 0, preparedCount: 0, missingCount: 0, state: 'no_riders' };
  }

  const scopedEligibleIds = riders.map(r => r.id);
  const totalEligible = scopedEligibleIds.length;

  // 3. Fetch existing payroll records for these eligible riders for this cutoff period
  const { data: existingRecords, error: recordErr } = await supabase
    .from('payroll_records')
    .select('rider_id')
    .eq('cutoff_start', cutoffFrom)
    .in('rider_id', scopedEligibleIds);

  if (recordErr) throw recordErr;

  const existingRiderIds = new Set((existingRecords || []).map(r => r.rider_id));
  const preparedCount = existingRiderIds.size;
  const missingCount = Math.max(0, totalEligible - preparedCount);

  let state: 'no_riders' | 'unprepared' | 'partial' | 'ready' = 'ready';
  if (totalEligible === 0) {
    state = 'no_riders';
  } else if (preparedCount === 0) {
    state = 'unprepared';
  } else if (preparedCount < totalEligible) {
    state = 'partial';
  } else {
    state = 'ready';
  }

  return {
    totalEligible,
    preparedCount,
    missingCount,
    state,
  };
};

/**
 * Deletes unedited draft payroll records (0 parcels and status 'draft') for a specific cutoff period.
 * Preserves any records that have parcels logged or status updated (submitted/approved/paid).
 */
export const resetDraftPayrollForCutoff = async (
  cutoffFrom: string
): Promise<number> => {
  const { data, error } = await supabase
    .from('payroll_records')
    .delete()
    .eq('cutoff_start', cutoffFrom)
    .eq('status', PayrollStatus.DRAFT)
    .eq('total_parcels', 0)
    .select('id');

  if (error) throw error;
  return data ? data.length : 0;
};

/**
 * Deletes a single payroll record by ID.
 */
export const deletePayrollRecord = async (id: string): Promise<void> => {
  const { data, error } = await supabase
    .from('payroll_records')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Record could not be deleted or does not exist.');
  }
};

/**
 * Bulk deletes payroll records by IDs.
 */
export const deleteBulkPayrollRecords = async (ids: string[]): Promise<number> => {
  if (!ids || ids.length === 0) return 0;
  const { data, error } = await supabase
    .from('payroll_records')
    .delete()
    .in('id', ids)
    .select('id');

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('No records were deleted. Permission denied or records not found.');
  }
  return data.length;
};


/**
 * Helper to compute standard MKB cutoff bounds (1-15 or 16-lastDay) for a given date string.
 */
export function getCutoffRangeForDate(dateStr: string): { cutoffFrom: string; cutoffTo: string } {
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d.getTime())) {
    const today = new Date();
    const day = today.getDate();
    const padStr = (n: number) => String(n).padStart(2, '0');
    if (day <= 15) {
      return {
        cutoffFrom: `${today.getFullYear()}-${padStr(today.getMonth() + 1)}-01`,
        cutoffTo: `${today.getFullYear()}-${padStr(today.getMonth() + 1)}-15`
      };
    } else {
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      return {
        cutoffFrom: `${today.getFullYear()}-${padStr(today.getMonth() + 1)}-16`,
        cutoffTo: `${today.getFullYear()}-${padStr(today.getMonth() + 1)}-${padStr(last)}`
      };
    }
  }

  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();
  const padStr = (n: number) => String(n).padStart(2, '0');

  if (day <= 15) {
    return {
      cutoffFrom: `${year}-${padStr(month + 1)}-01`,
      cutoffTo: `${year}-${padStr(month + 1)}-15`
    };
  } else {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return {
      cutoffFrom: `${year}-${padStr(month + 1)}-16`,
      cutoffTo: `${year}-${padStr(month + 1)}-${padStr(lastDay)}`
    };
  }
}

export interface SyncPayrollOptions {
  allowCreateMissing?: boolean;
}

/**
 * Automatically synchronizes payroll_records from parcel_logs for a specific cutoff period.
 * Aggregates daily parcel_logs (total parcels & gross pay) per rider and upserts payroll_records.
 */
export const syncPayrollRecordsFromParcelLogs = async (
  cutoffFrom: string,
  cutoffTo: string,
  options?: SyncPayrollOptions
): Promise<void> => {
  try {
    // 1. Fetch all parcel_logs for the cutoff period
    const { data: logs, error: logsErr } = await supabase
      .from('parcel_logs')
      .select('rider_id, date, parcels, heavy_parcels, rate, heavy_rate, standard_earnings, heavy_earnings, daily_gross, rate_configuration_id')
      .gte('date', cutoffFrom)
      .lte('date', cutoffTo);

    if (logsErr) {
      throw logsErr;
    }

    if (!logs || logs.length === 0) return;

    // 2. Fetch existing payroll records before validating live rows. Finalized
    // legacy payroll is immutable and does not depend on newly added rate metadata.
    const { data: existingRecords, error: existingRecordsErr } = await supabase
      .from('payroll_records')
      .select('id, rider_id, status')
      .eq('cutoff_start', cutoffFrom);

    if (existingRecordsErr) {
      throw existingRecordsErr;
    }

    const existingMap = new Map((existingRecords || []).map(r => [r.rider_id, r]));

    // 3. Aggregate parcels and gross pay only for records that may track live data.
    const riderAggregates = new Map<string, {
      standardParcels: number;
      heavyParcels: number;
      standardEarnings: number;
      heavyEarnings: number;
      gross: number;
      rate: number;
    }>();
    for (const log of logs) {
      const riderId = log.rider_id;
      if (!riderId) continue;

      const existing = existingMap.get(riderId);
      if (
        existing
        && existing.status !== PayrollStatus.DRAFT
        && existing.status !== PayrollStatus.REJECTED
      ) {
        continue;
      }

      const parcels = Number(log.parcels || 0);
      const heavyParcels = Number(log.heavy_parcels || 0);
      if (log.rate == null || log.heavy_rate == null || log.standard_earnings == null
        || log.heavy_earnings == null || log.daily_gross == null || !log.rate_configuration_id) {
        throw new MissingPayrollSnapshotError(`Stored rate data is incomplete for ${log.date}. Review the Parcel Operations record before payroll synchronization.`);
      }
      const rate = Number(log.rate);
      const standardEarnings = Number(log.standard_earnings);
      const heavyEarnings = Number(log.heavy_earnings);
      const gross = Number(log.daily_gross);

      const curr = riderAggregates.get(riderId) || {
        standardParcels: 0,
        heavyParcels: 0,
        standardEarnings: 0,
        heavyEarnings: 0,
        gross: 0,
        rate,
      };
      curr.standardParcels += parcels;
      curr.heavyParcels += heavyParcels;
      curr.standardEarnings += standardEarnings;
      curr.heavyEarnings += heavyEarnings;
      curr.gross += gross;
      curr.rate = rate;
      riderAggregates.set(riderId, curr);
    }

    // 4. Build upsert payload
    const allowCreateMissing = options?.allowCreateMissing ?? false;

    const upsertPayloads = Array.from(riderAggregates.entries()).flatMap(([riderId, agg]) => {
      const existing = existingMap.get(riderId);

      // Do not recreate draft records that were intentionally deleted,
      // unless explicit creation/initialization is requested.
      if (!existing && !allowCreateMissing) {
        return [];
      }

      // Only working records may track live parcel changes. Pending, approved,
      // paid, and other historical states must retain their submitted snapshot.
      if (
        existing
        && existing.status !== PayrollStatus.DRAFT
        && existing.status !== PayrollStatus.REJECTED
      ) {
        return [];
      }

      return [{
        ...(existing?.id ? { id: existing.id } : {}),
        rider_id: riderId,
        cutoff_start: cutoffFrom,
        cutoff_end: cutoffTo,
        total_parcels: agg.standardParcels + agg.heavyParcels,
        standard_parcels: agg.standardParcels,
        heavy_parcels: agg.heavyParcels,
        standard_earnings: agg.standardEarnings,
        heavy_earnings: agg.heavyEarnings,
        rate_per_parcel: agg.rate,
        gross_pay: agg.gross,
        status: existing?.status || PayrollStatus.DRAFT,
        updated_at: new Date().toISOString()
      }];
    });

    if (upsertPayloads.length === 0) return;

    const { error: upsertErr } = await supabase
      .from('payroll_records')
      .upsert(upsertPayloads, { onConflict: 'rider_id,cutoff_start' });

    if (upsertErr) {
      throw upsertErr;
    }
  } catch (err) {
    console.error('Error in syncPayrollRecordsFromParcelLogs:', err);
    throw err;
  }
};

// Get all payroll records for dashboard
export const getPayrollRecords = async (
  cutoffFrom: string,
  cutoffTo: string
) => {
  const { data, error } = await supabase
    .from('payroll_records')
    .select('*, riders(id, name, mkb_id, avatar_url, zone_id, notes, zones!riders_zone_id_fkey(name))')
    .gte('cutoff_start', cutoffFrom)
    .lte('cutoff_start', cutoffTo)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
};

export interface PaginatedPayrollParams {
  cutoffFrom: string;
  cutoffTo: string;
  page: number; // 1-indexed
  pageSize: number;
  search?: string;
  statusFilter?: string;
  zoneFilter?: string;
  sortBy?: 'riderName' | 'total_parcels' | 'gross_pay' | 'net_pay' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedPayrollResult {
  records: any[];
  totalCount: number;
}

// Get paginated, searched, filtered, and sorted payroll records for dashboard
export const getPaginatedPayrollRecords = async (params: PaginatedPayrollParams): Promise<PaginatedPayrollResult> => {
  const {
    cutoffFrom,
    cutoffTo,
    page,
    pageSize,
    search,
    statusFilter,
    zoneFilter,
    sortBy = 'riderName',
    sortOrder = 'asc'
  } = params;

  // 1. Build base query with exact count
  // We use riders!inner to allow filtering on relation attributes (name, mkb_id, zone_id)
  let query = supabase
    .from('payroll_records')
    .select(`
      *,
      riders!inner(id, name, mkb_id, avatar_url, zone_id, notes, zones!riders_zone_id_fkey(name)),
      submitted_user:users!payroll_records_submitted_by_fkey(full_name, email),
      approved_user:users!payroll_records_approved_by_fkey(full_name, email),
      rejected_user:users!payroll_records_rejected_by_fkey(full_name, email),
      returned_user:users!payroll_records_returned_by_fkey(full_name, email),
      paid_user:users!payroll_records_paid_by_fkey(full_name, email)
    `, { count: 'exact' })
    .gte('cutoff_start', cutoffFrom)
    .lte('cutoff_start', cutoffTo);

  // 2. Filter by status
  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter.toLowerCase());
  }

  // 3. Filter by zone
  if (zoneFilter && zoneFilter !== 'all') {
    query = query.eq('riders.zone_id', zoneFilter);
  }

  // 4. Search by Rider Name or MKB ID or Zone Name
  if (search && search.trim() !== '') {
    const s = search.trim();
    let matchingZoneIds: string[] = [];
    try {
      const { data: zonesData } = await supabase
        .from('zones')
        .select('id')
        .ilike('name', `%${s}%`);
      if (zonesData && zonesData.length > 0) {
        matchingZoneIds = zonesData.map(z => z.id);
      }
    } catch (e) {
      console.error('Failed to lookup matching zones:', e);
    }

    let orCondition = `name.ilike.%${s}%,mkb_id.ilike.%${s}%`;
    if (matchingZoneIds.length > 0) {
      const zoneInString = matchingZoneIds.map(id => `"${id}"`).join(',');
      orCondition += `,zone_id.in.(${zoneInString})`;
    }
    
    query = query.or(orCondition, { foreignTable: 'riders' });
  }

  // 5. Sorting
  if (sortBy === 'riderName') {
    query = query.order('name', { foreignTable: 'riders', ascending: sortOrder === 'asc' });
  } else if (sortBy === 'total_parcels') {
    query = query.order('total_parcels', { ascending: sortOrder === 'asc' });
  } else if (sortBy === 'gross_pay') {
    query = query.order('gross_pay', { ascending: sortOrder === 'asc' });
  } else if (sortBy === 'status') {
    query = query.order('status', { ascending: sortOrder === 'asc' });
  } else if (sortBy === 'net_pay') {
    // Database does not store net_pay, fallback to gross_pay ordering
    query = query.order('gross_pay', { ascending: sortOrder === 'asc' });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  // 6. Pagination range
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;
  query = query.range(start, end);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    records: data ?? [],
    totalCount: count ?? 0
  };
};

// Get parcel logs for a rider for their own view
export const getMyParcelLogs = async (
  riderId: string,
  cutoffFrom: string,
  cutoffTo: string
): Promise<ParcelLog[]> => {
  return getParcelLogs(riderId, cutoffFrom, cutoffTo);
};

export interface PayrollMetrics {
  presentDays: number;
  lateDays: number;
  violationsCount: number;
  attendanceLogs: {
    date: string;
    time_in: string | null;
    time_out: string | null;
    status: string;
  }[];
  violations: {
    created_at: string;
    type: string;
    zone_name: string | null;
  }[];
}

// Get attendance and violation counts/logs for a rider within a cutoff period
export const getRiderPayrollMetrics = async (
  riderId: string,
  cutoffFrom: string,
  cutoffTo: string
): Promise<PayrollMetrics> => {
  const { data: attendance, error: attError } = await supabase
    .from('v_attendance_summary')
    .select('date, time_in, time_out, raw_time_in, raw_time_out, log_status, hr_status')
    .eq('rider_id', riderId)
    .gte('date', cutoffFrom)
    .lte('date', cutoffTo);

  if (attError) throw attError;

  // Query violations for this rider in the cutoff range
  const startIso = `${cutoffFrom}T00:00:00.000Z`;
  const endIso = `${cutoffTo}T23:59:59.999Z`;
  const { data: violations, error: violError } = await supabase
    .from('violations')
    .select('created_at, type, zone_name')
    .eq('rider_id', riderId)
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  if (violError) throw violError;

  const rows = (attendance ?? []) as unknown as Array<{
    date: string;
    time_in: string | null;
    time_out: string | null;
    raw_time_in: string | null;
    raw_time_out: string | null;
    log_status: string | null;
    hr_status: string | null;
  }>;

  const mappedAttendance = rows.map(row => {
    const summaryFacts = resolveAttendanceSummaryFacts({
      timeIn: row.time_in,
      rawTimeIn: row.raw_time_in,
      logStatus: row.log_status,
      hrStatus: row.hr_status,
    });
    const isPresent = summaryFacts.hasAnyTimeIn || summaryFacts.isLogPresent || summaryFacts.isLate;
    const status = summaryFacts.isLate
      ? 'late'
      : isPresent
      ? 'present'
      : (summaryFacts.isLogLeave ? 'on_leave' : 'absent');
    return {
      date: row.date,
      time_in: row.raw_time_in || row.time_in || null,
      time_out: row.raw_time_out || row.time_out || null,
      status
    };
  });

  const presentDays = mappedAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
  const lateDays = mappedAttendance.filter(a => a.status === 'late').length;
  const violationsCount = (violations ?? []).filter(v => v.type === 'boundary_exit' || v.type === 'idle_timeout').length;

  return {
    presentDays,
    lateDays,
    violationsCount,
    attendanceLogs: mappedAttendance,
    violations: violations ?? []
  };
};

// Update payroll record status
export const updatePayrollRecordStatus = async (
  recordId: string,
  status: PayrollStatus | 'draft' | 'pending' | 'approved' | 'paid' | 'flagged' | 'rejected' | 'draft',
  auditData?: {
    userId: string;
    rejectionReason?: string;
  }
): Promise<void> => {
  const normStatus = status as PayrollStatus;
  const updatePayload: any = { status: normStatus, updated_at: new Date().toISOString() };
  if (auditData) {
    const { userId, rejectionReason } = auditData;
    if (normStatus === PayrollStatus.PENDING) {
      updatePayload.submitted_by = userId;
      updatePayload.submitted_at = new Date().toISOString();
    } else if (normStatus === PayrollStatus.APPROVED) {
      updatePayload.approved_by = userId;
      updatePayload.approved_at = new Date().toISOString();
    } else if (normStatus === PayrollStatus.REJECTED) {
      updatePayload.rejected_by = userId;
      updatePayload.rejected_at = new Date().toISOString();
      updatePayload.rejection_reason = rejectionReason || null;
    } else if (normStatus === PayrollStatus.PAID) {
      updatePayload.paid_by = userId;
      updatePayload.paid_at = new Date().toISOString();
      updatePayload.processed_at = new Date().toISOString(); // for backward compatibility
    } else if (normStatus === PayrollStatus.DRAFT) {
      // Return attribution is captured authoritatively by the database trigger.
      // Earlier actor UUIDs and snapshots remain historical evidence.
    }
  }

  // 1. Fetch record info to log activity properly
  let riderName = 'Rider';
  let cutoffStart = '';
  let cutoffEnd = '';
  let currentRecordVersion: { status: string; updated_at: string } | null = null;
  try {
    const { data: record, error: recordError } = await supabase
      .from('payroll_records')
      .select('id, rider_id, cutoff_start, cutoff_end, total_parcels, standard_parcels, heavy_parcels, standard_earnings, heavy_earnings, gross_pay, rate_configuration_id, calculation_version, snapshot_finalized_at, status, updated_at, riders(name)')
      .eq('id', recordId)
      .single();

    if (recordError) throw recordError;
    if (!record) throw new Error('Payroll record not found.');
    if (normStatus === PayrollStatus.PENDING) {
      await getPayrollDeliveryData(record);
    }
    riderName = (record.riders as any)?.name || 'Rider';
    cutoffStart = record.cutoff_start;
    cutoffEnd = record.cutoff_end;
    currentRecordVersion = { status: record.status, updated_at: record.updated_at };
  } catch (err) {
    console.error('Failed to validate payroll record before status update:', err);
    throw err;
  }

  // Approval and payment share the same authoritative, transactional database
  // boundary as their bulk equivalents. A singleton request preserves the
  // existing individual workflow without duplicating transition side effects.
  if (
    currentRecordVersion
    && (normStatus === PayrollStatus.APPROVED || normStatus === PayrollStatus.PAID)
  ) {
    const transitionInput = {
      records: [{ id: recordId, ...currentRecordVersion }],
      cutoffStart,
      cutoffEnd,
      requestId: globalThis.crypto.randomUUID(),
    };
    if (normStatus === PayrollStatus.APPROVED) {
      await bulkApprovePayrollRecords(transitionInput);
    } else {
      await bulkMarkPayrollRecordsPaid(transitionInput);
    }
    return;
  }

  const { error } = await supabase
    .from('payroll_records')
    .update(updatePayload)
    .eq('id', recordId);

  if (error) throw error;

  // The database trigger writes the authoritative submit/reject/return audit
  // entry with the same actor snapshot as the payroll row. Approval/payment
  // audit entries are written inside the atomic transition RPC.
  try {
    // Non-blocking notification dispatches for Payroll transitions
    const senderId = auditData?.userId || null;
    if (normStatus === PayrollStatus.PENDING) {
      void dispatchNotificationSafe({
        senderId,
        category: 'payroll',
        priority: 'medium',
        type: 'system',
        title: 'Payroll Submitted for Review',
        message: `Payroll for ${riderName} (${cutoffStart} to ${cutoffEnd}) was submitted for approval`,
        actionLink: '/payroll',
        targetRoles: ['payroll', 'admin']
      });
    } else if (normStatus === PayrollStatus.APPROVED) {
      void dispatchNotificationSafe({
        senderId,
        category: 'payroll',
        priority: 'high',
        type: 'system',
        title: 'Payroll Approved',
        message: `Payroll for ${riderName} (${cutoffStart} to ${cutoffEnd}) has been approved`,
        actionLink: '/payroll',
        targetRoles: ['payroll', 'admin']
      });
    } else if (normStatus === PayrollStatus.PAID) {
      void dispatchNotificationSafe({
        senderId,
        category: 'payroll',
        priority: 'high',
        type: 'system',
        title: 'Payroll Disbursed & Paid',
        message: `Payroll for ${riderName} (${cutoffStart} to ${cutoffEnd}) has been paid`,
        actionLink: '/payroll',
        targetRoles: ['payroll', 'admin']
      });
    } else if (normStatus === PayrollStatus.REJECTED) {
      void dispatchNotificationSafe({
        senderId,
        category: 'payroll',
        priority: 'high',
        type: 'system',
        title: 'Payroll Rejected',
        message: `Payroll for ${riderName} (${cutoffStart} to ${cutoffEnd}) was returned/rejected`,
        actionLink: '/payroll',
        targetRoles: ['payroll', 'admin']
      });
    }
  } catch (logErr) {
    console.warn('Failed to write payroll transition log:', logErr);
  }
};

// Bulk submit payroll records for approval (prevents resubmission of already pending/approved/paid)
export const bulkSubmitPayrollForApproval = async (
  recordIds: string[],
  userId: string
): Promise<void> => {
  if (recordIds.length === 0) return;

  // 1. Fetch current status of records to validate they are editable (draft or rejected)
  const { data: records, error: fetchError } = await supabase
    .from('payroll_records')
    .select('id, rider_id, status, cutoff_start, cutoff_end, total_parcels, standard_parcels, heavy_parcels, standard_earnings, heavy_earnings, gross_pay, rate_configuration_id, calculation_version, snapshot_finalized_at, riders(name)')
    .in('id', recordIds);

  if (fetchError) throw fetchError;
  if (!records || records.length === 0) {
    throw new Error('No payroll records found for the selected IDs.');
  }

  // 2. Validate status to prevent resubmission
  const invalidRecords = records.filter(
    r => r.status !== PayrollStatus.DRAFT && r.status !== PayrollStatus.REJECTED
  );
  if (invalidRecords.length > 0) {
    throw new Error('Some selected records are already submitted, approved, or paid.');
  }

  await Promise.all(records.map(record => getPayrollDeliveryData(record)));

  // 3. Perform bulk update
  const { error: updateError } = await supabase
    .from('payroll_records')
    .update({
      status: PayrollStatus.PENDING,
      submitted_by: userId,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .in('id', recordIds);

  if (updateError) throw updateError;

  // The workflow trigger writes one authoritative audit event per row with
  // the server-resolved actor snapshot.
};


// Fetch parcel logs in date range for all riders
export const getParcelLogsSummary = async (from: string, to: string) => {
  const { data, error } = await supabase
    .from('parcel_logs')
    .select('parcels, heavy_parcels, failed_parcels, returned_parcels, standard_earnings, heavy_earnings, daily_gross, date, rider_id, riders(id, name, zone_id)')
    .gte('date', from)
    .lte('date', to);

  if (error) throw error;
  return data || [];
};

// Fetch payroll records status summaries in date range
export const getPayrollRecordsSummary = async (from: string, to: string) => {
  const { data, error } = await supabase
    .from('payroll_records')
    .select('rider_id, status')
    .gte('cutoff_start', from)
    .lte('cutoff_start', to);

  if (error) throw error;
  return data || [];
};

// Fetch dynamic filtered parcel logs details with linked rider & zone profiles
export const getParcelLogsDetails = async (
  from: string,
  to: string,
  filters?: {
    riderId?: string;
    riderIds?: string[];
  }
) => {
  let query = supabase
    .from('parcel_logs')
    .select('*, riders(name, mkb_id, zones!riders_zone_id_fkey(name))')
    .gte('date', from)
    .lte('date', to);

  if (filters?.riderId) {
    query = query.eq('rider_id', filters.riderId);
  } else if (filters?.riderIds && filters.riderIds.length > 0) {
    query = query.in('rider_id', filters.riderIds);
  }

  const { data, error } = await query.order('date', { ascending: true });
  if (error) throw error;
  return data || [];
};

// Bulk upsert daily parcel logs for multiple riders
export const bulkUpsertParcelLogs = async (
  logs: {
    rider_id: string;
    date: string;
    parcels: number;
    rate: number;
    daily_gross?: number;
    created_by: string;
  }[]
): Promise<void> => {
  const sanitizedLogs = logs.map(({ daily_gross: _daily_gross, ...rest }) => rest);
  const { error } = await supabase
    .from('parcel_logs')
    .upsert(sanitizedLogs, { onConflict: 'rider_id,date' });

  if (error) throw error;

  try {
    const cutoffKeys = new Set<string>();
    for (const log of logs) {
      if (log.date) {
        const { cutoffFrom, cutoffTo } = getCutoffRangeForDate(log.date);
        cutoffKeys.add(`${cutoffFrom}|${cutoffTo}`);
      }
    }
    for (const key of cutoffKeys) {
      const [cFrom, cTo] = key.split('|');
      await syncPayrollRecordsFromParcelLogs(cFrom, cTo);
    }
  } catch (syncErr) {
    console.warn('Post-bulk upsert log payroll sync warning:', syncErr);
  }
};

export interface ArchivedPayrollCutoff {
  cutoffStart: string;
  cutoffEnd: string;
  label: string;
  riderCount: number;
  totalGross: number;
  status: string;
}

export const getArchivedPayrollCutoffsSummary = async (
  hubId?: string | null
): Promise<ArchivedPayrollCutoff[]> => {
  let query = supabase
    .from('payroll_records')
    .select(`
      id,
      cutoff_start,
      cutoff_end,
      gross_pay,
      status,
      rider_id,
      riders!inner(id, hub_id, zone_id)
    `)
    .order('cutoff_start', { ascending: false });

  if (hubId) {
    query = query.eq('riders.hub_id', hubId);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const groups = new Map<string, {
    cutoffStart: string;
    cutoffEnd: string;
    riderIds: Set<string>;
    totalGross: number;
    statuses: string[];
  }>();

  for (const row of data as any[]) {
    const key = `${row.cutoff_start}_${row.cutoff_end}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        cutoffStart: row.cutoff_start,
        cutoffEnd: row.cutoff_end,
        riderIds: new Set(),
        totalGross: 0,
        statuses: [],
      };
      groups.set(key, group);
    }
    group.riderIds.add(row.rider_id);
    group.totalGross += Number(row.gross_pay || 0);
    group.statuses.push(row.status);
  }

  const MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const results: ArchivedPayrollCutoff[] = [];
  for (const group of groups.values()) {
    const [startYear, startMonth, startDay] = group.cutoffStart.split('-').map(Number);
    const [, , endDay] = group.cutoffEnd.split('-').map(Number);
    const monthName = MONTH_NAMES[(startMonth || 1) - 1] || 'Cutoff';
    const label = `${monthName} ${startDay}–${endDay}, ${startYear}`;

    const normalizedStatuses = group.statuses.map(s => (s === 'pending' ? 'submitted' : s));
    const uniqueStatuses = new Set(normalizedStatuses);

    let aggregateStatus = 'draft';
    if (uniqueStatuses.size === 1) {
      const [singleStatus] = Array.from(uniqueStatuses);
      aggregateStatus = singleStatus;
    } else if (uniqueStatuses.size > 1) {
      aggregateStatus = 'mixed';
    }

    results.push({
      cutoffStart: group.cutoffStart,
      cutoffEnd: group.cutoffEnd,
      label,
      riderCount: group.riderIds.size,
      totalGross: group.totalGross,
      status: aggregateStatus,
    });
  }

  return results;
};
