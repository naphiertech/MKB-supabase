import { describe, expect, it, vi, beforeEach } from 'vitest';
import { supabase } from '../../lib/supabaseClient';
import {
  correctRiderAttendance,
  getAttendanceAuditHistory,
} from './attendanceCorrectionService';

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { rpc: vi.fn() },
}));

const rpc = vi.mocked(supabase.rpc);

describe('attendanceCorrectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('correctRiderAttendance', () => {
    it('calls correct_rider_attendance RPC with normalized payload and returns data', async () => {
      rpc.mockResolvedValueOnce({
        data: {
          success: true,
          attendance_log_id: 'log-123',
          rider_id: 'r-001',
          rider_name: 'Juan Rider',
          date: '2026-10-04',
          status: 'present',
          time_in: '2026-10-04T08:00:00+08:00',
          time_out: '2026-10-04T17:00:00+08:00',
          source: 'attendance_correction',
          correction_type: 'forgot_time_in',
          reason: 'Rider was on site and app froze during morning biometric scan.',
          evidence_reference: 'https://storage/evidence.png',
        },
        error: null,
      } as any);

      const { data, error } = await correctRiderAttendance({
        riderId: 'r-001',
        date: '2026-10-04',
        status: 'present',
        correctionType: 'forgot_time_in',
        reason: '  Rider was on site and app froze during morning biometric scan.  ',
        timeIn: '2026-10-04T08:00:00+08:00',
        timeOut: '2026-10-04T17:00:00+08:00',
        evidenceReference: '  https://storage/evidence.png  ',
      });

      expect(error).toBeNull();
      expect(rpc).toHaveBeenCalledWith('correct_rider_attendance', {
        p_rider_id: 'r-001',
        p_date: '2026-10-04',
        p_status: 'present',
        p_correction_type: 'forgot_time_in',
        p_reason: 'Rider was on site and app froze during morning biometric scan.',
        p_time_in: '2026-10-04T08:00:00+08:00',
        p_time_out: '2026-10-04T17:00:00+08:00',
        p_evidence_reference: 'https://storage/evidence.png',
      });

      expect(data?.attendance_log_id).toBe('log-123');
      expect(data?.status).toBe('present');
    });

    it('returns error object when RPC returns database error', async () => {
      rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Approved or paid payroll exists for this date. Attendance is locked.' },
      } as any);

      const { data, error } = await correctRiderAttendance({
        riderId: 'r-001',
        date: '2026-10-04',
        status: 'present',
        correctionType: 'authorized_correction',
        reason: 'Manual adjustment test',
      });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toContain('Approved or paid payroll exists for this date');
    });
  });

  describe('getAttendanceAuditHistory', () => {
    it('calls get_attendance_log_audit_history with filters and returns records', async () => {
      const mockRows = [
        {
          id: 'audit-1',
          attendance_log_id: 'log-1',
          rider_id: 'r-1',
          rider_name: 'Juan Rider',
          hub_id: 'hub-1',
          hub_name: 'North Hub',
          business_date: '2026-10-04',
          action: 'UPDATE',
          old_status: 'absent',
          new_status: 'present',
          old_time_in: null,
          new_time_in: '2026-10-04T08:00:00+08:00',
          old_time_out: null,
          new_time_out: '2026-10-04T17:00:00+08:00',
          old_source: 'daily_finalizer',
          new_source: 'attendance_correction',
          old_notes: null,
          new_notes: 'Manual correction',
          actor_id: 'user-1',
          actor_name: 'Admin User',
          actor_type: 'admin',
          change_source: 'attendance_correction',
          correction_type: 'forgot_time_in' as const,
          reason: 'Biometric device failed',
          evidence_reference: null,
          recorded_at: '2026-10-04T10:00:00+08:00',
        },
      ];

      rpc.mockResolvedValueOnce({
        data: mockRows,
        error: null,
      } as any);

      const { data, error } = await getAttendanceAuditHistory({
        riderId: 'r-1',
        date: '2026-10-04',
      });

      expect(error).toBeNull();
      expect(rpc).toHaveBeenCalledWith('get_attendance_log_audit_history', {
        p_attendance_log_id: null,
        p_rider_id: 'r-1',
        p_date: '2026-10-04',
      });

      expect(data).toEqual(mockRows);
    });

    it('returns empty array and error when RPC fails', async () => {
      rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Permission denied' },
      } as any);

      const { data, error } = await getAttendanceAuditHistory({
        attendanceLogId: 'log-123',
      });

      expect(data).toEqual([]);
      expect(error?.message).toContain('Permission denied');
    });
  });
});
