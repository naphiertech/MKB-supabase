import { supabase } from '../../lib/supabaseClient';
import { logActivity } from '../../lib/apiService';
import { getCutoffRangeForDate, syncPayrollRecordsFromParcelLogs } from '../parcelService';
import { validateParcelCount, validateParcelWorkDate } from './parcelOperationsPolicy';

export interface ParcelCorrectionRequest {
  id: string;
  parcelLogId: string;
  riderId: string;
  riderName?: string;
  riderMkbId?: string;
  riderAvatar?: string;
  date: string;
  previousDelivered: number;
  previousHeavy: number;
  previousFailed: number;
  previousReturned: number;
  requestedDelivered: number;
  requestedHeavy: number;
  requestedFailed: number;
  requestedReturned: number;
  reason: string;
  requestedBy: string;
  requestedByName?: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface ParcelLogAuditEntry {
  id: string;
  parcelLogId: string;
  riderId: string;
  date: string;
  oldDelivered: number;
  oldHeavy: number;
  oldFailed: number;
  oldReturned: number;
  newDelivered: number;
  newHeavy: number;
  newFailed: number;
  newReturned: number;
  actionType: 'created' | 'updated' | 'correction_requested' | 'correction_approved' | 'correction_rejected';
  correctionRequestId?: string;
  reason?: string;
  changedBy?: string;
  changedByName?: string;
  approvedBy?: string;
  approvedByName?: string;
  timestamp: string;
}

/**
 * Checks whether the payroll cutoff for a given shift date is locked (pending review, approved, or paid).
 * Returns true if direct edits are prohibited and must go through Correction Request workflow.
 */
export async function isCutoffLockedForDate(dateStr: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('payroll_records')
    .select('status')
    .lte('cutoff_start', dateStr)
    .gte('cutoff_end', dateStr)
    .limit(1);

  if (error || !data || data.length === 0) {
    return false;
  }

  const status = (data[0].status || '').toLowerCase();
  return status === 'pending' || status === 'approved' || status === 'paid' || status === 'flagged';
}

/**
 * Creates a formal parcel log correction request when an existing record is modified.
 */
export async function createParcelCorrectionRequest(payload: {
  parcelLogId: string;
  riderId: string;
  date: string;
  previousDelivered: number;
  previousHeavy: number;
  previousFailed: number;
  previousReturned: number;
  requestedDelivered: number;
  requestedHeavy: number;
  requestedFailed: number;
  requestedReturned: number;
  reason: string;
  requestedBy: string;
}): Promise<void> {
  validateParcelWorkDate(payload.date);
  validateParcelCount(payload.previousDelivered, 'Previous Standard Delivered');
  validateParcelCount(payload.previousHeavy, 'Previous Heavy Delivered');
  validateParcelCount(payload.previousFailed, 'Previous Failed');
  validateParcelCount(payload.previousReturned, 'Previous Returned');
  validateParcelCount(payload.requestedDelivered, 'Requested Standard Delivered');
  validateParcelCount(payload.requestedHeavy, 'Requested Heavy Delivered');
  validateParcelCount(payload.requestedFailed, 'Requested Failed');
  validateParcelCount(payload.requestedReturned, 'Requested Returned');
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validRequestedBy = uuidRegex.test(payload.requestedBy) ? payload.requestedBy : null;

  const { data: request, error } = await supabase.from('parcel_correction_requests').insert({
    parcel_log_id: payload.parcelLogId,
    rider_id: payload.riderId,
    date: payload.date,
    previous_delivered: payload.previousDelivered,
    previous_heavy: payload.previousHeavy,
    previous_failed: payload.previousFailed,
    previous_returned: payload.previousReturned,
    requested_delivered: payload.requestedDelivered,
    requested_heavy: payload.requestedHeavy,
    requested_failed: payload.requestedFailed,
    requested_returned: payload.requestedReturned,
    reason: payload.reason,
    requested_by: validRequestedBy,
    status: 'pending',
    requested_at: new Date().toISOString(),
  }).select('id').single();

  if (error || !request) {
    console.error('Error creating parcel correction request:', error);
    throw new Error(`Failed to submit correction request: ${error?.message || 'Insert error'}`);
  }

  const { error: auditErr } = await supabase.from('parcel_log_audit').insert({
    parcel_log_id: payload.parcelLogId,
    rider_id: payload.riderId,
    date: payload.date,
    old_delivered: payload.previousDelivered,
    old_heavy: payload.previousHeavy,
    old_failed: payload.previousFailed,
    old_returned: payload.previousReturned,
    new_delivered: payload.requestedDelivered,
    new_heavy: payload.requestedHeavy,
    new_failed: payload.requestedFailed,
    new_returned: payload.requestedReturned,
    action_type: 'correction_requested',
    correction_request_id: request.id,
    reason: payload.reason,
    changed_by: validRequestedBy,
    timestamp: new Date().toISOString(),
  });

  if (auditErr) {
    console.warn('Audit insert warning:', auditErr);
  }

  try {
    await logActivity({
      eventType: 'Parcel Correction Requested',
      description: `Submitted correction request for rider date ${payload.date}: Standard ${payload.previousDelivered} → ${payload.requestedDelivered}, Heavy ${payload.previousHeavy} → ${payload.requestedHeavy}. Reason: ${payload.reason}`,
      metadata: { parcel_log_id: payload.parcelLogId, rider_id: payload.riderId, date: payload.date }
    });
  } catch (err) {
    console.warn('Activity log notice:', err);
  }
}

/**
 * Fetches all parcel correction requests (or filtered by status) for Admin review.
 */
export async function getParcelCorrectionRequests(statusFilter?: 'pending' | 'approved' | 'rejected'): Promise<ParcelCorrectionRequest[]> {
  let query = supabase
    .from('parcel_correction_requests')
    .select(`
      id,
      parcel_log_id,
      rider_id,
      date,
      previous_delivered,
      previous_heavy,
      previous_failed,
      previous_returned,
      requested_delivered,
      requested_heavy,
      requested_failed,
      requested_returned,
      reason,
      requested_by,
      requested_at,
      status,
      reviewed_by,
      reviewed_at,
      review_notes,
      riders (
        name,
        mkb_id,
        avatar_url,
        face_image_url
      )
    `);

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  query = query.order('requested_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching correction requests:', error);
    throw error;
  }

  const rawRows = (data || []) as unknown as Array<{
    id: string;
    parcel_log_id: string;
    rider_id: string;
    date: string;
    previous_delivered: number;
    previous_heavy: number;
    previous_failed: number;
    previous_returned: number;
    requested_delivered: number;
    requested_heavy: number;
    requested_failed: number;
    requested_returned: number;
    reason: string;
    requested_by: string | null;
    requested_at: string;
    status: 'pending' | 'approved' | 'rejected';
    reviewed_by: string | null;
    reviewed_at: string | null;
    review_notes: string | null;
    riders: { name: string; mkb_id: string; avatar_url: string | null; face_image_url: string | null } | null;
  }>;

  const userIds = Array.from(
    new Set(
      rawRows
        .flatMap(r => [r.requested_by, r.reviewed_by])
        .filter((id): id is string => !!id)
    )
  );

  const userMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users } = await supabase.from('users').select('id, full_name, email').in('id', userIds);
    if (users) {
      users.forEach(u => {
        userMap[u.id] = u.full_name || u.email || 'User';
      });
    }
  }

  return rawRows.map(r => {
    const rider = Array.isArray(r.riders) ? r.riders[0] : r.riders;
    const resolvedAvatar = rider?.face_image_url || rider?.avatar_url || null;

    return {
      id: r.id,
      parcelLogId: r.parcel_log_id,
      riderId: r.rider_id,
      riderName: rider?.name || 'Unknown Rider',
      riderMkbId: rider?.mkb_id || 'N/A',
      riderAvatar: resolvedAvatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(rider?.name || '')}`,
      date: r.date,
      previousDelivered: r.previous_delivered,
      previousHeavy: r.previous_heavy,
      previousFailed: r.previous_failed,
      previousReturned: r.previous_returned,
      requestedDelivered: r.requested_delivered,
      requestedHeavy: r.requested_heavy,
      requestedFailed: r.requested_failed,
      requestedReturned: r.requested_returned,
      reason: r.reason,
      requestedBy: r.requested_by || 'System',
      requestedByName: r.requested_by ? userMap[r.requested_by] || 'HR Staff' : 'Operations Staff',
      requestedAt: r.requested_at,
      status: r.status,
      reviewedBy: r.reviewed_by || undefined,
      reviewedByName: r.reviewed_by ? userMap[r.reviewed_by] || 'Admin' : undefined,
      reviewedAt: r.reviewed_at || undefined,
      reviewNotes: r.review_notes || undefined,
    };
  });
}

/**
 * Reviews (Approve or Reject) a parcel correction request.
 */
export async function reviewParcelCorrectionRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
  reviewerId: string,
  reviewNotes?: string
): Promise<void> {
  const { data: request, error: fetchErr } = await supabase
    .from('parcel_correction_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (fetchErr || !request) {
    throw new Error(`Correction request not found: ${fetchErr?.message || requestId}`);
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validReviewerId = uuidRegex.test(reviewerId) ? reviewerId : null;
  const now = new Date().toISOString();

  if (decision === 'approved') {
    // 1. Update master parcel_logs record
    const { error: updateLogErr } = await supabase
      .from('parcel_logs')
      .update({
        parcels: request.requested_delivered,
        heavy_parcels: request.requested_heavy,
        failed_parcels: request.requested_failed,
        returned_parcels: request.requested_returned,
        updated_at: now,
      })
      .eq('id', request.parcel_log_id);

    if (updateLogErr) {
      console.error('Error updating parcel_log on approval:', updateLogErr);
      throw new Error(`Failed to update parcel log: ${updateLogErr.message}`);
    }

    // 2. Insert immutable audit trail entry 'correction_approved'
    const { error: auditErr } = await supabase.from('parcel_log_audit').insert({
      parcel_log_id: request.parcel_log_id,
      rider_id: request.rider_id,
      date: request.date,
      old_delivered: request.previous_delivered,
      old_heavy: request.previous_heavy,
      old_failed: request.previous_failed,
      old_returned: request.previous_returned,
      new_delivered: request.requested_delivered,
      new_heavy: request.requested_heavy,
      new_failed: request.requested_failed,
      new_returned: request.requested_returned,
      action_type: 'correction_approved',
      correction_request_id: request.id,
      reason: request.reason,
      changed_by: request.requested_by,
      approved_by: validReviewerId,
      timestamp: now,
    });

    if (auditErr) {
      console.warn('Audit record insert warning:', auditErr);
    }

    try {
      const { cutoffFrom, cutoffTo } = getCutoffRangeForDate(request.date);
      await syncPayrollRecordsFromParcelLogs(cutoffFrom, cutoffTo);
    } catch (syncErr) {
      console.warn('Post-correction payroll sync warning:', syncErr);
    }
  } else {
    const { error: rejectAuditErr } = await supabase.from('parcel_log_audit').insert({
      parcel_log_id: request.parcel_log_id,
      rider_id: request.rider_id,
      date: request.date,
      old_delivered: request.previous_delivered,
      old_heavy: request.previous_heavy,
      old_failed: request.previous_failed,
      old_returned: request.previous_returned,
      new_delivered: request.requested_delivered,
      new_heavy: request.requested_heavy,
      new_failed: request.requested_failed,
      new_returned: request.requested_returned,
      action_type: 'correction_rejected',
      correction_request_id: request.id,
      reason: reviewNotes || request.reason,
      changed_by: request.requested_by,
      approved_by: validReviewerId,
      timestamp: now,
    });
    if (rejectAuditErr) {
      console.warn('Audit insert warning:', rejectAuditErr);
    }
  }

  // 3. Mark request status
  const { error: reqUpdateErr } = await supabase
    .from('parcel_correction_requests')
    .update({
      status: decision,
      reviewed_by: validReviewerId,
      reviewed_at: now,
      review_notes: reviewNotes || null,
      updated_at: now,
    })
    .eq('id', requestId);

  if (reqUpdateErr) {
    console.error('Error updating correction request status:', reqUpdateErr);
    throw new Error(`Failed to update request status: ${reqUpdateErr.message}`);
  }

  try {
    await logActivity({
      eventType: decision === 'approved' ? 'Parcel Correction Approved' : 'Parcel Correction Rejected',
      description: `${decision === 'approved' ? 'Approved' : 'Rejected'} parcel correction request for date ${request.date}. ${reviewNotes ? `Notes: ${reviewNotes}` : ''}`,
      metadata: { requestId, parcel_log_id: request.parcel_log_id, decision, reviewerId }
    });
  } catch (err) {
    console.warn('Activity log notice:', err);
  }
}

/**
 * Retrieves full audit trail for a specific parcel log record.
 */
export async function getParcelLogAuditHistory(parcelLogId: string): Promise<ParcelLogAuditEntry[]> {
  const { data, error } = await supabase
    .from('parcel_log_audit')
    .select('*')
    .eq('parcel_log_id', parcelLogId)
    .order('timestamp', { ascending: false });

  if (error) {
    console.error('Error fetching parcel audit history:', error);
    return [];
  }

  const rawRows = (data || []) as unknown as Array<{
    id: string;
    parcel_log_id: string;
    rider_id: string;
    date: string;
    old_delivered: number;
    old_heavy: number;
    old_failed: number;
    old_returned: number;
    new_delivered: number;
    new_heavy: number;
    new_failed: number;
    new_returned: number;
    action_type: 'created' | 'updated' | 'correction_requested' | 'correction_approved' | 'correction_rejected';
    correction_request_id: string | null;
    reason: string | null;
    changed_by: string | null;
    approved_by: string | null;
    timestamp: string;
  }>;

  const userIds = Array.from(
    new Set(
      rawRows
        .flatMap(r => [r.changed_by, r.approved_by])
        .filter((id): id is string => !!id)
    )
  );

  const userMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users } = await supabase.from('users').select('id, full_name, email').in('id', userIds);
    if (users) {
      users.forEach(u => {
        userMap[u.id] = u.full_name || u.email || 'User';
      });
    }
  }

  return rawRows.map(r => ({
    id: r.id,
    parcelLogId: r.parcel_log_id,
    riderId: r.rider_id,
    date: r.date,
    oldDelivered: r.old_delivered,
    oldHeavy: r.old_heavy,
    oldFailed: r.old_failed,
    oldReturned: r.old_returned,
    newDelivered: r.new_delivered,
    newHeavy: r.new_heavy,
    newFailed: r.new_failed,
    newReturned: r.new_returned,
    actionType: r.action_type,
    correctionRequestId: r.correction_request_id || undefined,
    reason: r.reason || undefined,
    changedBy: r.changed_by || undefined,
    changedByName: r.changed_by ? userMap[r.changed_by] || 'HR Staff' : 'Operations Staff',
    approvedBy: r.approved_by || undefined,
    approvedByName: r.approved_by ? userMap[r.approved_by] || 'Admin' : 'System Admin',
    timestamp: r.timestamp,
  }));
}
