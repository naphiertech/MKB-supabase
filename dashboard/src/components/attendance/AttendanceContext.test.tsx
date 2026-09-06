// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { AttendanceTable } from './AttendanceTable';
import type { AttendanceContextCode, AttendanceContextLog, AttendanceContextStatus } from '../../services/attendance/attendanceContextService';

function context(status: AttendanceContextStatus, code: AttendanceContextCode): AttendanceContextLog {
  return {
    id: null, attendanceLogId: null, riderId: 'rider', riderName: 'Rider', riderAvatar: '', riderCode: 'MKB', date: '2026-09-01',
    timeIn: null, timeOut: null, rawTimeIn: null, rawTimeOut: null, hours: 0, zoneId: 'zone', zoneName: 'Zone',
    rawStatus: 'absent', status, presence: status, punctuality: 'none', completionState: 'absent', source: 'system',
    lat: null, lng: null, isFinalized: true, expectedToWork: status !== 'day_off', expectedWorkBasis: 'employed_rider_fallback',
    plannedLeaveState: null, plannedLeaveEffective: false, plannedLeaveRequestId: null, plannedLeaveRequestRevision: null,
    absenceNoticeState: null, absenceNoticeEffective: false, absenceNoticeRequestId: null, absenceNoticeRequestRevision: null,
    excusalState: code === 'accepted_notice' ? 'excused' : 'not_applicable', contextCode: code,
    contextRequestId: null, contextRequestKind: null, contextRequestRevision: null, hubId: 'hub', scheduleId: null,
    scheduleDayKind: null, events: [],
  };
}

describe('Attendance context presentation', () => {
  it.each([
    ['on_leave', 'approved_leave', 'On Leave', 'Approved Leave'],
    ['absent', 'accepted_notice', 'Absent', 'Accepted Notice'],
    ['absent', 'leave_rejected', 'Absent', 'Leave Rejected'],
    ['absent', 'notice_rejected', 'Absent', 'Notice Rejected'],
    ['absent', 'no_notice', 'Absent', 'No Notice'],
    ['day_off', 'published_day_off', 'Day Off', 'Published Day Off'],
    ['present', 'worked_during_approved_leave', 'Present', 'Worked During Approved Leave'],
  ] as const)('renders %s / %s in the existing status cell', (status, code, label, secondary) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      const row = context(status, code);
      if (status === 'present') Object.assign(row, { timeIn: '08:03', rawTimeIn: '2026-09-01T00:03:00Z' });
      act(() => root.render(<AttendanceTable logs={[row]} />));
      const cells = container.querySelectorAll('tbody tr:first-child td');
      expect(cells[5].textContent).toContain(label);
      expect(cells[5].textContent).toContain(secondary);
      expect([...container.querySelectorAll('th')].some(th => th.textContent === 'Context')).toBe(false);
      if (status !== 'present') {
        act(() => (container.querySelector('[aria-label="Toggle details"]') as HTMLButtonElement).click());
        expect(container.textContent).toContain('No clock evidence');
        expect(container.textContent).not.toMatch(/Valid \(Inside Zone\)|Manual Override Applied|Anti-Spoofing Passed/);
      }
    } finally {
      act(() => root.unmount());
      Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    }
  });
});
