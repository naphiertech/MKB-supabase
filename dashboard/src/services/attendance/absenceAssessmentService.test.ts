import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../../lib/supabaseClient';
import {
  listAbsenceAssessments,
  mapAbsenceAssessmentRow,
  MAX_RANGE_DAYS,
  MAX_PAGE_SIZE,
  type AbsenceAssessmentApiRow,
} from './absenceAssessmentService';

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { rpc: vi.fn() },
}));

const rpc = vi.mocked(supabase.rpc);

function mockApiRow(overrides: Partial<AbsenceAssessmentApiRow> = {}): AbsenceAssessmentApiRow {
  return {
    rider_id: 'rider-1',
    business_date: '2026-09-09',
    effective_status: 'absent',
    context_code: 'accepted_notice',
    expected_to_work: true,
    is_finalized: true,
    assessment_status: 'excused',
    assessment_reason: 'accepted_notice',
    policy_version_id: 'policy-1',
    policy_version_number: 1,
    policy_type: 'provisional',
    attendance_log_id: 'attendance-1',
    ...overrides,
  };
}

describe('absenceAssessmentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mapAbsenceAssessmentRow', () => {
    it('maps raw snake_case payload to camelCase AbsenceAssessmentRow', () => {
      const raw = mockApiRow();
      const mapped = mapAbsenceAssessmentRow(raw);

      expect(mapped).toEqual({
        riderId: 'rider-1',
        businessDate: '2026-09-09',
        effectiveStatus: 'absent',
        contextCode: 'accepted_notice',
        expectedToWork: true,
        isFinalized: true,
        assessmentStatus: 'excused',
        assessmentReason: 'accepted_notice',
        policyVersionId: 'policy-1',
        policyVersionNumber: 1,
        policyType: 'provisional',
        attendanceLogId: 'attendance-1',
      });
    });

    it('never maps unexpected private fields from raw mock payload', () => {
      const rawWithPrivate = {
        ...mockApiRow(),
        reason: 'medical private info',
        review_reason: 'sensitive hr review',
        notes: 'internal staff notes',
        audit: { ip: '127.0.0.1' },
      };

      const mapped = mapAbsenceAssessmentRow(rawWithPrivate);
      expect(mapped).not.toHaveProperty('reason');
      expect(mapped).not.toHaveProperty('reviewReason');
      expect(mapped).not.toHaveProperty('review_reason');
      expect(mapped).not.toHaveProperty('notes');
      expect(mapped).not.toHaveProperty('audit');
    });

    it('handles null nullable fields safely', () => {
      const raw = mockApiRow({
        effective_status: null,
        context_code: null,
        attendance_log_id: null,
      });
      const mapped = mapAbsenceAssessmentRow(raw);

      expect(mapped.effectiveStatus).toBeNull();
      expect(mapped.contextCode).toBeNull();
      expect(mapped.attendanceLogId).toBeNull();
    });
  });

  describe('listAbsenceAssessments validation', () => {
    it('throws when startDate or endDate is missing or invalid', async () => {
      await expect(
        listAbsenceAssessments({ startDate: '', endDate: '2026-09-10' })
      ).rejects.toThrow('A valid Absence assessment date range is required.');

      await expect(
        listAbsenceAssessments({ startDate: 'invalid', endDate: '2026-09-10' })
      ).rejects.toThrow('A valid Absence assessment date range is required.');
    });

    it('throws when endDate is before startDate', async () => {
      await expect(
        listAbsenceAssessments({ startDate: '2026-09-15', endDate: '2026-09-10' })
      ).rejects.toThrow('A valid Absence assessment date range is required.');
    });

    it('throws when date range exceeds MAX_RANGE_DAYS (32 days)', async () => {
      await expect(
        listAbsenceAssessments({ startDate: '2026-09-01', endDate: '2026-10-15' })
      ).rejects.toThrow(`Absence assessment reads are limited to ${MAX_RANGE_DAYS} calendar days.`);
    });

    it('throws when limit is out of bounds (1..500)', async () => {
      await expect(
        listAbsenceAssessments({ startDate: '2026-09-10', endDate: '2026-09-15', limit: 0 })
      ).rejects.toThrow(`Absence assessment page size must be between 1 and ${MAX_PAGE_SIZE}.`);

      await expect(
        listAbsenceAssessments({ startDate: '2026-09-10', endDate: '2026-09-15', limit: 501 })
      ).rejects.toThrow(`Absence assessment page size must be between 1 and ${MAX_PAGE_SIZE}.`);
    });

    it('throws when offset is negative', async () => {
      await expect(
        listAbsenceAssessments({ startDate: '2026-09-10', endDate: '2026-09-15', offset: -1 })
      ).rejects.toThrow('Absence assessment page offset must be between 0 and 100000.');
    });

    it('throws when assessmentStatus is invalid', async () => {
      await expect(
        listAbsenceAssessments({
          startDate: '2026-09-10',
          endDate: '2026-09-15',
          assessmentStatus: 'invalid_status' as any,
        })
      ).rejects.toThrow('Unsupported assessment status: invalid_status');
    });
  });

  describe('listAbsenceAssessments RPC execution', () => {
    it('invokes RPC with formatted parameters and returns mapped rows', async () => {
      const mockRows = [mockApiRow()];
      rpc.mockResolvedValueOnce({ data: mockRows, error: null } as any);

      const result = await listAbsenceAssessments({
        startDate: '2026-09-09',
        endDate: '2026-09-15',
        hubId: 'hub-1',
        riderId: 'rider-1',
        assessmentStatus: 'excused',
        limit: 100,
        offset: 0,
      });

      expect(rpc).toHaveBeenCalledWith('list_rider_absence_assessments', {
        p_start_date: '2026-09-09',
        p_end_date: '2026-09-15',
        p_hub_id: 'hub-1',
        p_rider_id: 'rider-1',
        p_assessment_status: 'excused',
        p_limit: 100,
        p_offset: 0,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        riderId: 'rider-1',
        businessDate: '2026-09-09',
        effectiveStatus: 'absent',
        contextCode: 'accepted_notice',
        expectedToWork: true,
        isFinalized: true,
        assessmentStatus: 'excused',
        assessmentReason: 'accepted_notice',
        policyVersionId: 'policy-1',
        policyVersionNumber: 1,
        policyType: 'provisional',
        attendanceLogId: 'attendance-1',
      });
    });

    it('propagates Supabase RPC errors', async () => {
      const dbError = new Error('RPC Error: 42501 permission denied');
      rpc.mockResolvedValueOnce({ data: null, error: dbError } as any);

      await expect(
        listAbsenceAssessments({
          startDate: '2026-09-10',
          endDate: '2026-09-15',
        })
      ).rejects.toThrow('RPC Error: 42501 permission denied');
    });
  });
});
