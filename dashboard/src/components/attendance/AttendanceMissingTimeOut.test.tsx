import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AttendanceLog, ViolationEvent } from '../../services/types';
import { NeedsAttention } from '../hr/NeedsAttention';
import { AttendanceTable } from './AttendanceTable';

const missingTimeOutLog: AttendanceLog = {
  id: 'attendance-1',
  riderId: 'rider-1',
  riderName: 'Juan Rider',
  riderAvatar: '',
  date: '2026-08-04',
  timeIn: '08:00',
  timeOut: null,
  rawTimeIn: '2026-08-04T08:00:00+08:00',
  rawTimeOut: null,
  hours: 0,
  zoneId: 'zone-1',
  zoneName: 'North',
  status: 'present',
  presence: 'present',
  punctuality: 'on_time',
  completionStatus: 'missing_time_out',
  source: 'face-scan',
  events: [],
};

describe('Missing Time Out presentation', () => {
  it('labels a past open shift in Attendance Logs without inventing a Time Out', () => {
    const html = renderToStaticMarkup(<AttendanceTable logs={[missingTimeOutLog]} />);

    expect(html).toContain('Missing Time Out');
    expect(html).not.toContain('17:00');
  });

  it('counts a past open shift in HR Needs Attention even when generated hours are zero', () => {
    const html = renderToStaticMarkup(<NeedsAttention
      attendanceLogs={[missingTimeOutLog]}
      violations={[] as ViolationEvent[]}
      onNavigate={vi.fn()}
    />);

    expect(html).toContain('Missing Time Out');
    expect(html).toContain('Previous work date requires review');
  });
});
