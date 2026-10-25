import { describe, expect, it } from 'vitest';
import type { AttendanceLog } from '../../services/types';
import { countTriage, matchesTriage } from './attendanceTriage';

function log(id: number, overrides: Partial<AttendanceLog> = {}): AttendanceLog {
  return {
    id: `a-${id}`,
    riderId: `r-${id}`,
    riderName: `Rider ${id}`,
    riderAvatar: '',
    date: '2026-10-25',
    timeIn: '08:00',
    timeOut: '17:00',
    rawTimeIn: '2026-10-25T08:00:00+08:00',
    rawTimeOut: '2026-10-25T17:00:00+08:00',
    hours: 9,
    zoneId: 'z-a',
    zoneName: 'Alpha',
    status: 'present',
    presence: 'present',
    punctuality: 'on_time',
    completionStatus: 'complete',
    source: 'face-scan',
    events: [],
    ...overrides,
  } as AttendanceLog;
}

describe('attendance triage', () => {
  const logs = [
    ...Array.from({ length: 150 }, (_, i) => log(i)),
    log(200, { status: 'late', punctuality: 'late' }),
    log(201, { status: 'late', punctuality: 'late' }),
    log(202, { timeOut: null, rawTimeOut: null, completionStatus: 'missing_time_out' }),
    log(203, { source: 'manual' }),
    log(204, { status: 'absent', presence: 'absent', timeIn: null, timeOut: null, completionStatus: 'absent' }),
  ];

  it('narrows 155 rows to the handful that need HR action', () => {
    expect(countTriage(logs)).toEqual({
      all: 155,
      exceptions: 5,
      late: 2,
      missing_time_out: 1,
      manual: 1,
    });
  });

  it('matches a normal complete row only under "all"', () => {
    const normal = log(1);
    expect(matchesTriage(normal, 'all')).toBe(true);
    expect(matchesTriage(normal, 'exceptions')).toBe(false);
  });
});
