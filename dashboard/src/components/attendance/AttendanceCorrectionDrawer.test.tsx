// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deriveAttendanceCorrectionStatus,
  AttendanceCorrectionDrawer,
} from './AttendanceCorrectionDrawer';

describe('AttendanceCorrectionDrawer policy derivation logic', () => {
  const LATE_THRESHOLD = '08:15:00';

  it('resolves to Present when corrected time_in is on or before late threshold', () => {
    const result = deriveAttendanceCorrectionStatus({
      correctionChoice: 'forgot_time_in',
      timeIn: '08:00',
      lateThreshold: LATE_THRESHOLD,
    });

    expect(result.status).toBe('present');
    expect(result.punctuality).toBe('On Time');
    expect(result.explanation).toContain('on or before the late threshold (8:15 AM PST)');
  });

  it('resolves to Present when corrected time_in is exactly on late threshold', () => {
    const result = deriveAttendanceCorrectionStatus({
      correctionChoice: 'forgot_time_in',
      timeIn: '08:15',
      lateThreshold: LATE_THRESHOLD,
    });

    expect(result.status).toBe('present');
    expect(result.punctuality).toBe('On Time');
  });

  it('resolves to Late when corrected time_in exceeds late threshold', () => {
    const result = deriveAttendanceCorrectionStatus({
      correctionChoice: 'forgot_time_in',
      timeIn: '08:30',
      lateThreshold: LATE_THRESHOLD,
    });

    expect(result.status).toBe('late');
    expect(result.punctuality).toBe('Late');
    expect(result.explanation).toContain('exceeds the late threshold (8:15 AM PST)');
  });

  it('preserves Present when forgot_time_out has an existing on-time time_in', () => {
    const result = deriveAttendanceCorrectionStatus({
      correctionChoice: 'forgot_time_out',
      initialTimeIn: '2026-10-04T07:55:00+08:00',
      initialStatus: 'present',
      lateThreshold: LATE_THRESHOLD,
    });

    expect(result.status).toBe('present');
    expect(result.punctuality).toBe('On Time');
    expect(result.explanation).toContain('was on time');
  });

  it('preserves Late when forgot_time_out has an existing late time_in', () => {
    const result = deriveAttendanceCorrectionStatus({
      correctionChoice: 'forgot_time_out',
      initialTimeIn: '2026-10-04T08:35:00+08:00',
      initialStatus: 'late',
      lateThreshold: LATE_THRESHOLD,
    });

    expect(result.status).toBe('late');
    expect(result.punctuality).toBe('Late');
    expect(result.explanation).toContain('was after the policy threshold');
  });

  it('resolves to Absent with timestamps cleared when mark_absent is selected', () => {
    const result = deriveAttendanceCorrectionStatus({
      correctionChoice: 'mark_absent',
      timeIn: '08:00',
      lateThreshold: LATE_THRESHOLD,
    });

    expect(result.status).toBe('absent');
    expect(result.punctuality).toBe('Absent');
    expect(result.explanation).toContain('Record will be corrected to Absent');
  });
});

describe('AttendanceCorrectionDrawer UI DOM integration', () => {
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

  it('portals drawer to body with policy preview and action buttons when open', () => {
    act(() => {
      root.render(
        <AttendanceCorrectionDrawer
          isOpen={true}
          onClose={() => undefined}
          onSuccess={() => undefined}
          initialLog={{
            id: 'log-1',
            riderId: 'rider-1',
            riderName: 'Juan Dela Cruz',
            date: '2026-10-04',
            timeIn: '2026-10-04T08:00:00+08:00',
            timeOut: null,
            status: 'present',
            source: 'rider',
            zoneName: 'Central Hub',
          }}
        />,
      );
    });

    const bodyText = document.body.textContent || '';
    expect(bodyText).toContain('Authoritative Attendance Correction');
    expect(bodyText).toContain('Computed Attendance Result');
    expect(bodyText).toContain('Juan Dela Cruz');
    expect(bodyText).toContain('Authorize & Apply Correction');
    expect(bodyText).toContain('Audit Reason');
    expect(bodyText).toContain('Official Leave Workflow Protected');

    // Drawer dialog role should be present on body (portaled)
    const dialog = document.body.querySelector('[role="dialog"][aria-modal="true"]');
    expect(dialog).not.toBeNull();
  });
});
