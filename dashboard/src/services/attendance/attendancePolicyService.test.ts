import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatTime12Hour,
  getEffectiveAttendancePolicy,
  isAttendanceLate,
  isTimePastThreshold,
  normalizeTimeString,
  resolveLateThreshold,
  validateAttendancePolicyInput,
  createFutureAttendancePolicy,
  deactivateFutureAttendancePolicy,
  type AttendancePolicyConfiguration,
  type AttendancePolicyInput,
} from './attendancePolicyService';
import * as attendancePolicyService from './attendancePolicyService';
import { supabase } from '../../lib/supabaseClient';

vi.mock('../../lib/supabaseClient', () => {
  const fromMock = vi.fn();
  const authMock = {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-user-id' } }, error: null }),
  };
  return {
    supabase: {
      from: fromMock,
      rpc: vi.fn(),
      auth: authMock,
    },
  };
});

describe('attendancePolicyService', () => {
  const samplePolicies: AttendancePolicyConfiguration[] = [
    {
      id: 'policy-1',
      late_threshold: '08:15:00',
      effective_from: '2026-01-01',
      effective_until: '2026-08-31',
      active: true,
      change_reason: 'Initial policy: Late after 08:15',
      created_by: 'admin-1',
      updated_by: 'admin-1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'policy-2',
      late_threshold: '08:30:00',
      effective_from: '2026-09-01',
      effective_until: '2026-09-30',
      active: true,
      change_reason: 'Shift extension: Late after 08:30',
      created_by: 'admin-1',
      updated_by: 'admin-1',
      created_at: '2026-08-20T00:00:00Z',
      updated_at: '2026-08-20T00:00:00Z',
    },
    {
      id: 'policy-3',
      late_threshold: '08:10:00',
      effective_from: '2026-10-01',
      effective_until: null,
      active: true,
      change_reason: 'Earlier October threshold',
      created_by: 'admin-1',
      updated_by: 'admin-1',
      created_at: '2026-08-21T00:00:00Z',
      updated_at: '2026-08-21T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalizeTimeString & formatTime12Hour', () => {
    it('normalizes various time formats to HH:mm:ss', () => {
      expect(normalizeTimeString('8:15')).toBe('08:15:00');
      expect(normalizeTimeString('08:15')).toBe('08:15:00');
      expect(normalizeTimeString('08:15:00')).toBe('08:15:00');
      expect(normalizeTimeString('8:15:30')).toBe('08:15:30');
    });

    it('formats times to human-readable 12-hour strings', () => {
      expect(formatTime12Hour('08:15:00')).toBe('8:15 AM');
      expect(formatTime12Hour('08:30')).toBe('8:30 AM');
      expect(formatTime12Hour('17:00:00')).toBe('5:00 PM');
      expect(formatTime12Hour('12:00:00')).toBe('12:00 PM');
      expect(formatTime12Hour('00:00:00')).toBe('12:00 AM');
    });
  });

  describe('isTimePastThreshold', () => {
    it('evaluates threshold boundary accurately', () => {
      // Exactly at threshold -> NOT late (false)
      expect(isTimePastThreshold('08:15:00', '08:15:00')).toBe(false);
      expect(isTimePastThreshold('08:15', '08:15')).toBe(false);

      // Before threshold -> NOT late (false)
      expect(isTimePastThreshold('08:14:59', '08:15:00')).toBe(false);
      expect(isTimePastThreshold('08:00:00', '08:15:00')).toBe(false);
      expect(isTimePastThreshold('07:55', '08:15')).toBe(false);

      // After threshold -> LATE (true)
      expect(isTimePastThreshold('08:15:01', '08:15:00')).toBe(true);
      expect(isTimePastThreshold('08:16:00', '08:15:00')).toBe(true);
      expect(isTimePastThreshold('08:16', '08:15')).toBe(true);
      expect(isTimePastThreshold('08:31', '08:30')).toBe(true);
    });
  });

  describe('getEffectiveAttendancePolicy & resolveLateThreshold', () => {
    it('resolves policy-1 (08:15) for dates within Jan 1 - Aug 31, 2026', () => {
      const policyAug = getEffectiveAttendancePolicy(samplePolicies, '2026-08-20');
      expect(policyAug?.id).toBe('policy-1');
      expect(policyAug?.late_threshold).toBe('08:15:00');
      expect(resolveLateThreshold(samplePolicies, '2026-08-20')).toBe('08:15:00');
    });

    it('resolves policy-2 (08:30) for dates on or after Sep 1, 2026', () => {
      const policySep = getEffectiveAttendancePolicy(samplePolicies, '2026-09-01');
      expect(policySep?.id).toBe('policy-2');
      expect(policySep?.late_threshold).toBe('08:30:00');
      expect(resolveLateThreshold(samplePolicies, '2026-09-01')).toBe('08:30:00');
    });

    it('resolves the October policy without changing August or September history', () => {
      expect(resolveLateThreshold(samplePolicies, '2026-08-20')).toBe('08:15:00');
      expect(resolveLateThreshold(samplePolicies, '2026-09-20')).toBe('08:30:00');
      expect(resolveLateThreshold(samplePolicies, '2026-10-20')).toBe('08:10:00');
    });

    it('falls back to DEFAULT_LATE_THRESHOLD (08:15:00) when no policy matches', () => {
      expect(resolveLateThreshold([], '2026-08-20')).toBe('08:15:00');
    });
  });

  describe('isAttendanceLate with Date-Effective Policy Transitions', () => {
    it('exactly at 08:15 is On Time under 08:15 policy', () => {
      expect(isAttendanceLate('08:15:00', '2026-08-20', samplePolicies)).toBe(false);
    });

    it('08:16 is Late under 08:15 policy', () => {
      expect(isAttendanceLate('08:16:00', '2026-08-20', samplePolicies)).toBe(true);
    });

    it('08:20 on Aug 20 (before new effective date) is Late under 08:15 policy', () => {
      expect(isAttendanceLate('08:20:00', '2026-08-20', samplePolicies)).toBe(true);
    });

    it('08:20 on Sep 2 (after new effective date) is On Time under 08:30 policy', () => {
      expect(isAttendanceLate('08:20:00', '2026-09-02', samplePolicies)).toBe(false);
    });

    it('08:31 on Sep 2 (after new effective date) is Late under 08:30 policy', () => {
      expect(isAttendanceLate('08:31:00', '2026-09-02', samplePolicies)).toBe(true);
    });

    it('boundary test: exactly at end date of policy 1 (2026-08-31)', () => {
      expect(isAttendanceLate('08:20:00', '2026-08-31', samplePolicies)).toBe(true);
      expect(isAttendanceLate('08:15:00', '2026-08-31', samplePolicies)).toBe(false);
    });

    it('boundary test: exactly at start date of policy 2 (2026-09-01)', () => {
      expect(isAttendanceLate('08:20:00', '2026-09-01', samplePolicies)).toBe(false);
      expect(isAttendanceLate('08:30:00', '2026-09-01', samplePolicies)).toBe(false);
      expect(isAttendanceLate('08:30:01', '2026-09-01', samplePolicies)).toBe(true);
    });
  });

  describe('validateAttendancePolicyInput', () => {
    const today = '2026-08-24';

    it('passes for valid future policy input', () => {
      const input: AttendancePolicyInput = {
        lateThreshold: '08:30',
        effectiveFrom: '2026-09-01',
        reason: 'Adjusting shift arrival threshold for logistics surge',
      };
      expect(validateAttendancePolicyInput(input, today)).toBeNull();
    });

    it('rejects past or today effectiveFrom dates', () => {
      const pastInput: AttendancePolicyInput = {
        lateThreshold: '08:30',
        effectiveFrom: '2026-08-20',
        reason: 'Attempted retroactive change',
      };
      expect(validateAttendancePolicyInput(pastInput, today)).toBe('Effective date must be a future date.');

      const todayInput: AttendancePolicyInput = {
        lateThreshold: '08:30',
        effectiveFrom: today,
        reason: 'Today change',
      };
      expect(validateAttendancePolicyInput(todayInput, today)).toBe('Effective date must be a future date.');
    });

    it('rejects invalid time formats', () => {
      const badTimeInput: AttendancePolicyInput = {
        lateThreshold: 'invalid-time',
        effectiveFrom: '2026-09-01',
        reason: 'Valid reason',
      };
      expect(validateAttendancePolicyInput(badTimeInput, today)).toBe(
        'Please provide a valid late threshold time (e.g. 08:15 AM).'
      );
    });

    it('rejects empty change reason', () => {
      const noReasonInput: AttendancePolicyInput = {
        lateThreshold: '08:30',
        effectiveFrom: '2026-09-01',
        reason: '   ',
      };
      expect(validateAttendancePolicyInput(noReasonInput, today)).toBe(
        'A reason is required for every policy change.'
      );
    });
  });

  describe('Manila business date', () => {
    it('rolls to the next attendance date at Manila midnight regardless of UTC date', () => {
      const service = attendancePolicyService as typeof attendancePolicyService & {
        manilaDateString: (date: Date) => string;
      };

      expect(service.manilaDateString(new Date('2026-08-31T15:59:59.000Z'))).toBe('2026-08-31');
      expect(service.manilaDateString(new Date('2026-08-31T16:00:00.000Z'))).toBe('2026-09-01');
    });
  });

  describe('createFutureAttendancePolicy & deactivateFutureAttendancePolicy', () => {
    it('schedules a future policy through one atomic RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);

      await createFutureAttendancePolicy({
        lateThreshold: '08:45',
        effectiveFrom: '2026-11-01',
        reason: 'Q4 Peak Season Shift Expansion',
      });

      expect(supabase.rpc).toHaveBeenCalledTimes(1);
      expect(supabase.rpc).toHaveBeenCalledWith('schedule_attendance_policy', {
        p_late_threshold: '08:45:00',
        p_effective_from: '2026-11-01',
        p_change_reason: 'Q4 Peak Season Shift Expansion',
      });
      expect(supabase.from).not.toHaveBeenCalled();
      expect(supabase.auth.getUser).not.toHaveBeenCalled();
    });

    it('cancels a future policy through one atomic RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);

      await deactivateFutureAttendancePolicy(
        'policy-3',
        'October plan withdrawn'
      );

      expect(supabase.rpc).toHaveBeenCalledTimes(1);
      expect(supabase.rpc).toHaveBeenCalledWith('cancel_future_attendance_policy', {
        p_policy_id: 'policy-3',
        p_change_reason: 'October plan withdrawn',
      });
      expect(supabase.from).not.toHaveBeenCalled();
      expect(supabase.auth.getUser).not.toHaveBeenCalled();
    });

    it('surfaces an atomic cancellation failure to the caller', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: 'Policies that have already taken effect cannot be canceled.' },
      } as never);

      await expect(
        deactivateFutureAttendancePolicy('policy-1', 'Attempt to cancel historical policy')
      ).rejects.toThrow('Policies that have already taken effect cannot be canceled.');
    });
  });
});
