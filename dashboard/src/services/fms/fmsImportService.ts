import { supabase } from '../../lib/supabaseClient';
import { FmsParsedRow } from './fmsParser';
import { resolveAttendanceSummaryFacts } from '../../lib/attendance/attendanceSummaryPolicy';

export interface FmsImportBatch {
  id: string;
  source_system: string;
  business_date: string;
  filename: string;
  file_sha256: string;
  hub_id: string;
  imported_by: string;
  imported_at: string;
  source_row_count: number;
  status: 'staged' | 'partially_confirmed' | 'confirmed' | 'cancelled';
  parser_version: string;
  created_at: string;
}

export interface FmsObservationViewItem {
  id: string;
  batch_id: string;
  external_driver_id: string;
  external_driver_name: string;
  rider_id: string | null;
  rider_name?: string;
  rider_mkb_id?: string;
  rider_avatar?: string;
  zone_id?: string;
  contract_type?: string;
  vehicle_type?: string;
  assigned: number;
  assigned_target: number;
  handed_over: number;
  delivered: number;
  delivering: number;
  failed_delivery: number;
  stuck_at_delivering: number;
  on_hold: number;
  first_delivering_time: string | null;
  first_delivering_time_raw: string | null;
  time_since_last_delivery: string | null;
  confirmation_status: 'staged' | 'confirmed' | 'skipped';
  confirmed_at: string | null;
  confirmed_by: string | null;
  confirmed_standard_delivered: number | null;
  confirmed_heavy_delivered: number | null;
  confirmed_failed: number | null;
  confirmed_returned: number | null;
  parcel_log_id: string | null;

  // Comparison with existing parcel_log
  existingParcelLog: {
    id: string;
    parcels: number;
    heavy_parcels: number;
    failed_parcels: number;
    returned_parcels: number;
    assigned_parcels: number;
    updated_at: string;
  } | null;

  // Comparison with prior FMS snapshots on same date
  priorSnapshot: {
    batch_id: string;
    delivered: number;
    delivering: number;
    failed_delivery: number;
    imported_at: string;
  } | null;

  // Cutoff period status
  isCutoffLocked: boolean;
  cutoffStatus?: string | null;

  // Attendance status for the business date
  attendance?: {
    time_in: string | null;
    raw_time_in?: string | null;
    status?: string | null;
  } | null;
}

/**
 * Stages an FMS import batch and its child observation rows atomically via PostgreSQL RPC.
 */
export async function stageFmsImportBatch(payload: {
  sourceSystem?: string;
  businessDate: string;
  filename: string;
  fileSha256: string;
  hubId: string;
  sourceRowCount: number;
  observations: FmsParsedRow[];
}): Promise<{
  success: boolean;
  isExisting: boolean;
  batchId: string;
  businessDate: string;
  filename: string;
  sourceRowCount: number;
  status: string;
}> {
  const { data, error } = await supabase.rpc('stage_fms_import_batch', {
    p_source_system: payload.sourceSystem || 'spx_fms',
    p_business_date: payload.businessDate,
    p_filename: payload.filename,
    p_file_sha256: payload.fileSha256,
    p_hub_id: payload.hubId,
    p_source_row_count: payload.sourceRowCount,
    p_observations: payload.observations,
  });

  if (error) {
    console.error('Error staging FMS import batch:', error);
    throw error;
  }

  const res = data as any;
  return {
    success: Boolean(res.success),
    isExisting: Boolean(res.is_existing),
    batchId: res.batch_id,
    businessDate: res.business_date,
    filename: res.filename,
    sourceRowCount: res.source_row_count,
    status: res.status,
  };
}

/**
 * Confirms a single rider observation atomically via PostgreSQL RPC.
 */
export async function confirmFmsDailyRiderObservation(payload: {
  observationId: string;
  heavyDelivered: number;
  failed?: number | null;
  returned?: number | null;
  expectedLogUpdatedAt?: string | null;
  isExistingRecord: boolean;
}): Promise<{
  success: boolean;
  observationId: string;
  parcelLogId: string;
  riderId: string;
  businessDate: string;
  standardDelivered: number;
  heavyDelivered: number;
  failed: number;
  returned: number;
}> {
  const { data, error } = await supabase.rpc('confirm_fms_daily_rider_observation', {
    p_observation_id: payload.observationId,
    p_heavy_delivered: payload.heavyDelivered,
    p_failed: payload.failed ?? null,
    p_returned: payload.returned ?? null,
    p_expected_log_updated_at: payload.expectedLogUpdatedAt ?? null,
    p_is_existing_record: payload.isExistingRecord,
  });

  if (error) {
    console.error('Error confirming FMS observation:', error);
    throw error;
  }

  const res = data as any;
  return {
    success: Boolean(res.success),
    observationId: res.observation_id,
    parcelLogId: res.parcel_log_id,
    riderId: res.rider_id,
    businessDate: res.business_date,
    standardDelivered: res.standard_delivered,
    heavyDelivered: res.heavy_delivered,
    failed: res.failed,
    returned: res.returned,
  };
}

/**
 * Lists import batches for a specific Hub or global view.
 */
export async function listFmsImportBatches(hubId?: string | null): Promise<FmsImportBatch[]> {
  let query = supabase
    .from('fms_import_batches')
    .select(`
      id,
      source_system,
      business_date,
      filename,
      file_sha256,
      hub_id,
      imported_by,
      imported_at,
      source_row_count,
      status,
      parser_version,
      created_at
    `)
    .order('imported_at', { ascending: false });

  if (hubId) {
    query = query.eq('hub_id', hubId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error listing FMS import batches:', error);
    throw error;
  }

  return (data || []) as FmsImportBatch[];
}

/**
 * Fetches batch observations and enriches with rider mappings, existing parcel logs, OCC timestamps, and prior snapshot deltas.
 */
export async function getFmsBatchObservations(
  batchId: string,
  businessDate: string
): Promise<FmsObservationViewItem[]> {
  // 1. Fetch observations for the batch
  const { data: obsData, error: obsError } = await supabase
    .from('fms_daily_rider_observations')
    .select(`
      id,
      batch_id,
      external_driver_id,
      external_driver_name,
      rider_id,
      zone_id,
      contract_type,
      vehicle_type,
      assigned,
      assigned_target,
      handed_over,
      delivered,
      delivering,
      failed_delivery,
      stuck_at_delivering,
      on_hold,
      first_delivering_time,
      first_delivering_time_raw,
      time_since_last_delivery,
      confirmation_status,
      confirmed_at,
      confirmed_by,
      confirmed_standard_delivered,
      confirmed_heavy_delivered,
      confirmed_failed,
      confirmed_returned,
      parcel_log_id,
      created_at,
      riders:rider_id (
        id,
        name,
        mkb_id,
        face_image_url,
        avatar_url,
        status
      )
    `)
    .eq('batch_id', batchId)
    .order('external_driver_name', { ascending: true });

  if (obsError) {
    console.error('Error fetching batch observations:', obsError);
    throw obsError;
  }

  const rawObs = (obsData || []) as any[];

  // 2. Fetch existing mappings to auto-map unmapped observations
  const { data: mappingsData } = await supabase
    .from('external_rider_mappings')
    .select(`
      external_driver_id,
      rider_id,
      riders:rider_id (
        id,
        name,
        mkb_id,
        face_image_url,
        avatar_url,
        status
      )
    `)
    .eq('source_system', 'spx_fms');

  const mappingByDriverId: Record<string, any> = {};
  (mappingsData || []).forEach((m: any) => {
    mappingByDriverId[m.external_driver_id] = m;
  });

  // Collect all resolved rider IDs
  const resolvedRiderIds: string[] = [];
  rawObs.forEach((obs) => {
    const riderId = obs.rider_id || mappingByDriverId[obs.external_driver_id]?.rider_id || null;
    if (riderId) resolvedRiderIds.push(riderId);
  });

  const uniqueRiderIds = Array.from(new Set(resolvedRiderIds));

  // 3. Fetch existing parcel logs for these riders on this business date
  const existingLogsByRiderId: Record<string, any> = {};
  if (uniqueRiderIds.length > 0) {
    const { data: logsData } = await supabase
      .from('parcel_logs')
      .select('id, rider_id, parcels, heavy_parcels, failed_parcels, returned_parcels, assigned_parcels, updated_at')
      .eq('date', businessDate)
      .in('rider_id', uniqueRiderIds);

    (logsData || []).forEach((log: any) => {
      existingLogsByRiderId[log.rider_id] = log;
    });
  }

  // 4. Fetch prior FMS snapshots on the same date (excluding current batch)
  const { data: priorBatches } = await supabase
    .from('fms_import_batches')
    .select('id, imported_at')
    .eq('business_date', businessDate)
    .neq('id', batchId)
    .order('imported_at', { ascending: false });

  const priorBatchIds = (priorBatches || []).map((b: any) => b.id);
  const priorObsByDriverId: Record<string, any> = {};

  if (priorBatchIds.length > 0) {
    const { data: priorObsData } = await supabase
      .from('fms_daily_rider_observations')
      .select('batch_id, external_driver_id, delivered, delivering, failed_delivery, created_at')
      .in('batch_id', priorBatchIds)
      .order('created_at', { ascending: false });

    (priorObsData || []).forEach((p: any) => {
      if (!priorObsByDriverId[p.external_driver_id]) {
        const batchInfo = priorBatches?.find((b: any) => b.id === p.batch_id);
        priorObsByDriverId[p.external_driver_id] = {
          batch_id: p.batch_id,
          delivered: p.delivered,
          delivering: p.delivering,
          failed_delivery: p.failed_delivery,
          imported_at: batchInfo?.imported_at || p.created_at,
        };
      }
    });
  }

  // 5. Check Cutoff Locked Status for the business date
  const { data: payrollRecords } = await supabase
    .from('payroll_records')
    .select('rider_id, status, cutoff_start, cutoff_end')
    .lte('cutoff_start', businessDate)
    .gte('cutoff_end', businessDate)
    .in('rider_id', uniqueRiderIds);

  const lockedRiderSet = new Set<string>();
  const cutoffStatusByRider: Record<string, string> = {};
  (payrollRecords || []).forEach((pr: any) => {
    const st = (pr.status || '').toLowerCase();
    cutoffStatusByRider[pr.rider_id] = st;
    if (st === 'pending' || st === 'approved' || st === 'paid') {
      lockedRiderSet.add(pr.rider_id);
    }
  });

  // 6. Fetch Attendance Status for the business date
  const attendanceByRiderId: Record<string, { time_in: string | null; raw_time_in?: string | null; status?: string | null }> = {};
  if (uniqueRiderIds.length > 0) {
    const { data: attData } = await supabase
      .from('v_attendance_summary')
      .select('rider_id, time_in, raw_time_in, log_status, hr_status')
      .eq('date', businessDate)
      .in('rider_id', uniqueRiderIds);

    (attData || []).forEach((att: any) => {
      const summaryFacts = resolveAttendanceSummaryFacts({
        timeIn: att?.time_in,
        rawTimeIn: att?.raw_time_in,
        logStatus: att?.log_status,
        hrStatus: att?.hr_status,
      });
      const isPresent = summaryFacts.hasFormattedTimeIn
        || summaryFacts.isLogPresent
        || summaryFacts.isHrPresent
        || summaryFacts.isLate;
      const isLeave = summaryFacts.isLogLeave || summaryFacts.isHrLeave;
      const presenceStatus = isLeave ? 'on_leave' : summaryFacts.isLate ? 'late' : isPresent ? 'present' : 'absent';

      attendanceByRiderId[att.rider_id] = {
        time_in: att.time_in,
        raw_time_in: att.raw_time_in,
        status: presenceStatus,
      };
    });
  }

  // Map into view items
  return rawObs.map((obs) => {
    const mapping = mappingByDriverId[obs.external_driver_id];
    const rider = obs.riders || mapping?.riders || null;
    const riderId = obs.rider_id || mapping?.rider_id || null;
    const existingLog = riderId ? existingLogsByRiderId[riderId] || null : null;
    const priorSnap = priorObsByDriverId[obs.external_driver_id] || null;
    const isLocked = riderId ? lockedRiderSet.has(riderId) : false;
    const att = riderId ? attendanceByRiderId[riderId] || null : null;

    return {
      id: obs.id,
      batch_id: obs.batch_id,
      external_driver_id: obs.external_driver_id,
      external_driver_name: obs.external_driver_name,
      rider_id: riderId,
      rider_name: rider?.name,
      rider_mkb_id: rider?.mkb_id,
      rider_avatar: rider?.face_image_url || rider?.avatar_url,
      zone_id: obs.zone_id,
      contract_type: obs.contract_type,
      vehicle_type: obs.vehicle_type,
      assigned: obs.assigned,
      assigned_target: obs.assigned_target,
      handed_over: obs.handed_over,
      delivered: obs.delivered,
      delivering: obs.delivering,
      failed_delivery: obs.failed_delivery,
      stuck_at_delivering: obs.stuck_at_delivering,
      on_hold: obs.on_hold,
      first_delivering_time: obs.first_delivering_time,
      first_delivering_time_raw: obs.first_delivering_time_raw,
      time_since_last_delivery: obs.time_since_last_delivery,
      confirmation_status: obs.confirmation_status,
      confirmed_at: obs.confirmed_at,
      confirmed_by: obs.confirmed_by,
      confirmed_standard_delivered: obs.confirmed_standard_delivered,
      confirmed_heavy_delivered: obs.confirmed_heavy_delivered,
      confirmed_failed: obs.confirmed_failed,
      confirmed_returned: obs.confirmed_returned,
      parcel_log_id: obs.parcel_log_id,
      existingParcelLog: existingLog
        ? {
            id: existingLog.id,
            parcels: existingLog.parcels,
            heavy_parcels: existingLog.heavy_parcels,
            failed_parcels: existingLog.failed_parcels,
            returned_parcels: existingLog.returned_parcels,
            assigned_parcels: existingLog.assigned_parcels,
            updated_at: existingLog.updated_at,
          }
        : null,
      priorSnapshot: priorSnap,
      isCutoffLocked: isLocked,
      cutoffStatus: riderId ? cutoffStatusByRider[riderId] || null : null,
      attendance: att,
    };
  });
}

/**
 * Fetches a single FMS import batch by its unique ID.
 */
export async function getFmsImportBatchById(batchId: string): Promise<FmsImportBatch | null> {
  const { data, error } = await supabase
    .from('fms_import_batches')
    .select(`
      id,
      source_system,
      business_date,
      filename,
      file_sha256,
      hub_id,
      imported_by,
      imported_at,
      source_row_count,
      status,
      parser_version,
      created_at
    `)
    .eq('id', batchId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching FMS import batch by ID:', error);
    throw error;
  }

  return data as FmsImportBatch | null;
}

/**
 * Deterministically resolves the first actionable step when reopening a batch.
 */
export function resolveBatchResumeStep(
  batch: { status: string },
  observations: Array<{ rider_id: string | null; confirmation_status?: string }>
): number {
  if (batch.status === 'confirmed' || batch.status === 'cancelled') {
    return 6; // Step 6 (Summary / Read-only audit mode)
  }

  const hasUnmapped = observations.some((o) => !o.rider_id);
  if (hasUnmapped) {
    return 3; // Step 3 (Map Riders)
  }

  return 4; // Step 4 (Classify)
}

export interface FmsBatchDateGroup {
  dateKey: string;
  businessDate: string;
  hubId: string;
  latestBatch: FmsImportBatch;
  allBatches: FmsImportBatch[];
  totalSnapshots: number;
}

/**
 * Groups a flat list of batches by Hub + Business Date to present the latest snapshot prominently while preserving full history.
 */
export function groupBatchesByDate(batches: FmsImportBatch[]): FmsBatchDateGroup[] {
  const groupsMap = new Map<string, FmsImportBatch[]>();

  for (const b of batches) {
    const key = `${b.hub_id}_${b.business_date}`;
    const list = groupsMap.get(key) || [];
    list.push(b);
    groupsMap.set(key, list);
  }

  const result: FmsBatchDateGroup[] = [];
  for (const [key, list] of groupsMap.entries()) {
    const sorted = [...list].sort(
      (a, b) => new Date(b.imported_at).getTime() - new Date(a.imported_at).getTime()
    );
    const latest = sorted[0];
    result.push({
      dateKey: key,
      businessDate: latest.business_date,
      hubId: latest.hub_id,
      latestBatch: latest,
      allBatches: sorted,
      totalSnapshots: sorted.length,
    });
  }

  return result.sort(
    (a, b) => new Date(b.latestBatch.imported_at).getTime() - new Date(a.latestBatch.imported_at).getTime()
  );
}

