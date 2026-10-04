// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceAuditHistoryDrawer } from './AttendanceAuditHistoryDrawer';
import * as attendanceCorrectionService from '../../services/attendance/attendanceCorrectionService';

describe('AttendanceAuditHistoryDrawer UI DOM integration', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.style.overflow = '';
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('renders portaled drawer with audit history items and action badges', async () => {
    vi.spyOn(attendanceCorrectionService, 'getAttendanceAuditHistory').mockResolvedValueOnce({
      data: [
        {
          id: 'audit-1',
          attendance_log_id: 'log-1',
          rider_id: 'rider-1',
          rider_name: 'Maria Santos',
          hub_id: 'hub-1',
          hub_name: 'Main Hub',
          business_date: '2026-10-04',
          action: 'CORRECTION',
          old_status: 'absent',
          new_status: 'present',
          old_time_in: null,
          new_time_in: '2026-10-04T08:00:00+08:00',
          old_time_out: null,
          new_time_out: '2026-10-04T17:00:00+08:00',
          old_source: 'system',
          new_source: 'attendance_correction',
          old_notes: null,
          new_notes: 'Biometric device network failure; verified via zone manager log.',
          actor_id: 'user-admin-1',
          actor_name: 'HR Admin',
          actor_type: 'hr',
          change_source: 'attendance_correction',
          correction_type: 'forgot_time_in',
          reason: 'Biometric device network failure; verified via zone manager log.',
          evidence_reference: 'Ticket #8821',
          recorded_at: '2026-10-04T10:15:00+08:00',
        },
      ],
      error: null,
    });

    await act(async () => {
      root.render(
        <AttendanceAuditHistoryDrawer
          isOpen={true}
          onClose={() => undefined}
          riderName="Maria Santos"
          date="2026-10-04"
          attendanceLogId="log-1"
        />,
      );
    });

    const bodyText = document.body.textContent || '';
    expect(bodyText).toContain('Attendance Audit Trail');
    expect(bodyText).toContain('Maria Santos');
    expect(bodyText).toContain('HR Admin');
    expect(bodyText).toContain('CORRECTION');
    expect(bodyText).toContain('HR / Admin Correction');
    expect(bodyText).toContain('Ticket #8821');

    const dialog = document.body.querySelector('[role="dialog"][aria-modal="true"]');
    expect(dialog).not.toBeNull();
  });
});
