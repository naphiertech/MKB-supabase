import { describe, expect, it } from 'vitest';
import type { AttendanceLog } from './types';
import { resolveHistoricalAttendanceZone, type AttendanceAssignmentHistoryRow } from './historicalAttendanceContext';

function log(date: string): AttendanceLog {
  return {
    id: date, riderId: 'r1', riderName: 'Juan', riderAvatar: '', date,
    timeIn: '08:00', timeOut: '17:00', hours: 9,
    zoneId: 'current-zone', zoneName: 'Current Zone', status: 'present', presence: 'present',
    punctuality: 'on_time', source: 'face-scan', events: [],
  };
}

function assignment(overrides: Partial<AttendanceAssignmentHistoryRow>): AttendanceAssignmentHistoryRow {
  return {
    rider_id: 'r1', assignment_type: 'permanent_transfer', from_zone_id: 'old-zone', target_zone_id: 'new-zone',
    start_date: '2026-08-10', end_date: null, status: 'completed', ended_at: null,
    from_zone: { id: 'old-zone', name: 'Old Zone' }, target_zone: { id: 'new-zone', name: 'New Zone' },
    ...overrides,
  };
}

describe('historical attendance Zone resolution', () => {
  it('uses the source before and target after a permanent transfer effective date', () => {
    const history = [assignment({})];
    expect(resolveHistoricalAttendanceZone(log('2026-08-09'), history)).toMatchObject({ zoneId: 'old-zone', zoneName: 'Old Zone' });
    expect(resolveHistoricalAttendanceZone(log('2026-08-10'), history)).toMatchObject({ zoneId: 'new-zone', zoneName: 'New Zone' });
  });

  it('uses a temporary target only during its effective deployment period', () => {
    const history = [assignment({
      assignment_type: 'temporary_deployment', start_date: '2026-08-01', end_date: '2026-08-15',
      status: 'ended_early', ended_at: '2026-08-10T18:00:00+08:00', target_zone_id: 'temp-zone',
      target_zone: { id: 'temp-zone', name: 'Temporary Zone' },
    })];
    expect(resolveHistoricalAttendanceZone(log('2026-08-10'), history)).toMatchObject({ zoneId: 'temp-zone' });
    expect(resolveHistoricalAttendanceZone(log('2026-08-11'), history)).toMatchObject({ zoneId: 'old-zone' });
  });

  it('marks the view Zone as current assignment when no history is available', () => {
    expect(resolveHistoricalAttendanceZone(log('2026-08-01'), [])).toEqual({
      zoneId: 'current-zone', zoneName: 'Current Zone', zoneContext: 'current_assignment',
    });
  });
});
