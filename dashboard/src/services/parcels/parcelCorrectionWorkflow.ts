import { supabase } from '../../lib/supabaseClient';
import { logActivity } from '../../lib/apiService';
import { getCutoffRangeForDate, refreshDraftPayrollForRiderCutoff } from '../parcelService';
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
  changeSource?: string;
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
  const { error } = await supabase.rpc('submit_parcel_correction_request', {
    p_parcel_log_id: payload.parcelLogId,
    p_requested_delivered: payload.requestedDelivered,
    p_requested_heavy: payload.requestedHeavy,
    p_requested_failed: payload.requestedFailed,
    p_requested_returned: payload.requestedReturned,
    p_reason: payload.reason,
  });

  if (error) {
    console.error('Error creating parcel correction request via RPC:', error);
    throw new Error(`Failed to submit correction request: ${error.message}`);
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
 * Reviews (Approve or Reject) a parcel correction request via authoritative atomic RPC.
 */
export async function reviewParcelCorrectionRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
  reviewerId: string,
  reviewNotes?: string
): Promise<void> {
  const { data: request, error: fetchErr } = await supabase
    .from('parcel_correction_requests')
    .select('id, parcel_log_id, rider_id, date')
    .eq('id', requestId)
    .single();

  if (fetchErr || !request) {
    throw new Error(`Correction request not found: ${fetchErr?.message || requestId}`);
  }

  const { error: rpcErr } = await supabase.rpc('review_parcel_correction_request', {
    p_request_id: requestId,
    p_decision: decision,
    p_review_notes: reviewNotes || null,
  });

  if (rpcErr) {
    console.error('Error reviewing parcel correction request via RPC:', rpcErr);
    throw new Error(`Failed to review correction request: ${rpcErr.message}`);
  }

  if (decision === 'approved') {
    try {
      const { cutoffFrom, cutoffTo } = getCutoffRangeForDate(request.date);
      await refreshDraftPayrollForRiderCutoff(request.rider_id, cutoffFrom, cutoffTo);
    } catch (syncErr) {
      console.warn('Post-correction payroll sync warning:', syncErr);
    }
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
    change_source: string | null;
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
    changeSource: r.change_source || undefined,
    changedBy: r.changed_by || undefined,
    changedByName: r.changed_by ? userMap[r.changed_by] || 'HR Staff' : 'Operations Staff',
    approvedBy: r.approved_by || undefined,
    approvedByName: r.approved_by ? userMap[r.approved_by] || 'Admin' : 'System Admin',
    timestamp: r.timestamp,
  }));
}
