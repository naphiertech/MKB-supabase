import { supabase } from '../../lib/supabaseClient';

export type AttendanceCorrectionType =
  | 'forgot_time_in'
  | 'forgot_time_out'
  | 'app_device_issue'
  | 'verified_attendance_error'
  | 'authorized_correction'
  | 'other';

export interface CorrectAttendanceParams {
  riderId: string;
  date: string;
  status: 'present' | 'late' | 'absent';
  correctionType: AttendanceCorrectionType;
  reason: string;
  timeIn?: string | null;
  timeOut?: string | null;
  evidenceReference?: string | null;
}

export interface AttendanceAuditLog {
  id: string;
  attendance_log_id: string;
  rider_id: string;
  rider_name: string;
  hub_id: string | null;
  hub_name: string | null;
  business_date: string;
  action: string;
  old_status: string | null;
  new_status: string | null;
  old_time_in: string | null;
  new_time_in: string | null;
  old_time_out: string | null;
  new_time_out: string | null;
  old_source: string | null;
  new_source: string | null;
  old_notes: string | null;
  new_notes: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_type: string;
  change_source: string;
  correction_type: AttendanceCorrectionType | null;
  reason: string | null;
  evidence_reference: string | null;
  recorded_at: string;
}

export interface CorrectAttendanceResponse {
  success: boolean;
  attendance_log_id: string;
  rider_id: string;
  rider_name: string;
  date: string;
  status: string;
  time_in: string | null;
  time_out: string | null;
  source: string;
  correction_type: AttendanceCorrectionType;
  reason: string;
  evidence_reference: string | null;
}

export async function correctRiderAttendance(
  params: CorrectAttendanceParams
): Promise<{ data: CorrectAttendanceResponse | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('correct_rider_attendance', {
      p_rider_id: params.riderId,
      p_date: params.date,
      p_status: params.status,
      p_correction_type: params.correctionType,
      p_reason: params.reason.trim(),
      p_time_in: params.timeIn || null,
      p_time_out: params.timeOut || null,
      p_evidence_reference: params.evidenceReference?.trim() || null,
    });

    if (error) {
      return { data: null, error: new Error(error.message || 'Failed to correct attendance') };
    }

    return { data: data as CorrectAttendanceResponse, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: new Error(message) };
  }
}

export async function getAttendanceAuditHistory(params: {
  attendanceLogId?: string;
  riderId?: string;
  date?: string;
}): Promise<{ data: AttendanceAuditLog[]; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('get_attendance_log_audit_history', {
      p_attendance_log_id: params.attendanceLogId || null,
      p_rider_id: params.riderId || null,
      p_date: params.date || null,
    });

    if (error) {
      return { data: [], error: new Error(error.message || 'Failed to fetch attendance audit history') };
    }

    return { data: (data as AttendanceAuditLog[]) || [], error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: [], error: new Error(message) };
  }
}
