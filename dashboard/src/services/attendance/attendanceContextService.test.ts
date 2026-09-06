import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../../lib/supabaseClient';
import {
  listAttendanceContext,
  getPresentationStatus,
  mergeAttendanceContextDetails,
  mapAttendanceContextRow,
  type AttendanceContextApiRow,
} from './attendanceContextService';

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { rpc: vi.fn() },
}));

const rpc = vi.mocked(supabase.rpc);

function apiRow(overrides: Partial<AttendanceContextApiRow> = {}): AttendanceContextApiRow {
  return {
    rider_id: 'rider-1',
    rider_name: 'Rider One',
    rider_mkb_id: 'MKB-001',
    rider_avatar: null,
    rider_lat: null,
    rider_lng: null,
    zone_id: 'zone-1',
    zone_name: 'Zone One',
    business_date: '2026-09-01',
    attendance_log_id: null,
    raw_status: null,
    time_in: null,
    time_out: null,
    hours: null,
    attendance_source: null,
    effective_status: 'absent',
    completion_state: 'absent',
    punctuality_state: 'none',
    is_finalized: true,
    expected_to_work: true,
    expected_work_basis: 'employed_rider_fallback',
    planned_leave_state: 'approved',
    planned_leave_effective: true,
    planned_leave_request_id: 'request-1',
    planned_leave_request_revision: 2,
    absence_notice_state: null,
    absence_notice_effective: false,
    absence_notice_request_id: null,
    absence_notice_request_revision: null,
    excusal_state: 'excused',
    context_code: 'approved_leave',
    context_request_id: 'request-1',
    context_request_kind: 'planned_leave',
    context_request_revision: 2,
    hub_id: 'hub-1',
    schedule_id: null,
    schedule_day_kind: null,
    ...overrides,
  };
}

describe('attendance context mapping', () => {
  it('uses effective report status without changing raw evidence', () => {
    const log = { ...mapAttendanceContextRow(apiRow()), status: 'absent' as const, effectiveStatus: 'present' as const };
    expect(getPresentationStatus(log)).toBe('present');
    expect(log.status).toBe('absent');
  });
  it('keeps effective context separate from raw attendance evidence', () => {
    const mapped = mapAttendanceContextRow(apiRow({
      attendance_log_id: null,
      raw_status: 'absent',
      effective_status: 'on_leave',
      context_code: 'approved_leave',
    }));

    expect(mapped).toMatchObject({
      id: null,
      rawStatus: 'absent',
      status: 'on_leave',
      contextCode: 'approved_leave',
      contextRequestId: 'request-1',
    });
    expect(mapped).not.toHaveProperty('reason');
    expect(mapped).not.toHaveProperty('reviewReason');
  });

  it('does not invent an attendance ID for a logical no-row date', () => {
    expect(mapAttendanceContextRow(apiRow({
      business_date: '2026-09-02',
      effective_status: 'not_finalized',
      context_code: null,
    }))).toMatchObject({ id: null, date: '2026-09-02', status: 'not_finalized' });
  });

  it('reuses raw attendance details only for matching persisted rows', () => {
    const mapped = mapAttendanceContextRow(apiRow({ attendance_log_id: 'log-1', rider_lat: null, rider_lng: null }));
    const merged = mergeAttendanceContextDetails([mapped], [{
      id: 'log-1',
      riderId: 'rider-1',
      riderName: 'Rider One',
      riderAvatar: 'avatar.png',
      date: '2026-09-01',
      timeIn: '08:00',
      timeOut: '17:00',
      rawTimeIn: '2026-09-01T00:00:00.000Z',
      rawTimeOut: '2026-09-01T09:00:00.000Z',
      hours: 9,
      zoneId: 'zone-1',
      zoneName: 'Zone One',
      status: 'present',
      presence: 'present',
      punctuality: 'on_time',
      source: 'face-scan',
      events: [{ ts: '08:01', type: 'enter', zone: 'Zone One' }],
    }]);

    expect(merged[0]).toMatchObject({ riderAvatar: 'avatar.png', source: 'face-scan', events: [{ type: 'enter' }] });
  });
});

describe('listAttendanceContext', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('reads a bounded window and maps server rows', async () => {
    rpc.mockResolvedValue({ data: [apiRow()], error: null } as never);

    await expect(listAttendanceContext({
      fromDate: '2026-09-01',
      toDate: '2026-09-02',
      hubId: 'hub-1',
      riderId: 'rider-1',
    })).resolves.toMatchObject([{ date: '2026-09-01', status: 'absent' }]);

    expect(rpc).toHaveBeenCalledWith('list_rider_attendance_context', {
      p_from_date: '2026-09-01',
      p_to_date: '2026-09-02',
      p_hub_id: 'hub-1',
      p_rider_id: 'rider-1',
      p_page_size: 500,
      p_page_offset: 0,
    });
  });

  it('splits a longer report period into bounded server windows', async () => {
    rpc.mockImplementation((async (_name: string, args: { p_from_date?: string }) => ({
      data: [apiRow({ business_date: String(args?.p_from_date) })],
      error: null,
    })) as never);

    const rows = await listAttendanceContext({ fromDate: '2026-09-01', toDate: '2026-10-05' });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map(([, args]) => [args?.p_from_date, args?.p_to_date])).toEqual([
      ['2026-09-01', '2026-10-02'],
      ['2026-10-03', '2026-10-05'],
    ]);
    expect(rows).toHaveLength(2);
  });

  it('continues page reads when a server page is full', async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => apiRow({
      business_date: `2026-09-${String((index % 30) + 1).padStart(2, '0')}`,
      attendance_log_id: `log-${index}`,
    }));
    rpc
      .mockResolvedValueOnce({ data: firstPage, error: null } as never)
      .mockResolvedValueOnce({ data: [apiRow({ attendance_log_id: 'log-last' })], error: null } as never);

    await expect(listAttendanceContext({ fromDate: '2026-09-01', toDate: '2026-09-30' })).resolves.toHaveLength(501);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_page_offset: 500 });
  });

  it('rejects an invalid date window before calling Supabase', async () => {
    await expect(listAttendanceContext({ fromDate: '2026-09-03', toDate: '2026-09-01' }))
      .rejects.toThrow('valid Attendance context date range');
    expect(rpc).not.toHaveBeenCalled();
  });
});
