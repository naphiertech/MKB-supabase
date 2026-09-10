// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  contextVersion: 'realtime-1:0',
  selectedHubId: 'hub-1',
}));

vi.mock('../../context/HubContext', () => ({
  useHub: () => ({ selectedHubId: mocks.selectedHubId }),
}));

vi.mock('../../hooks/useAttendanceContextVersion', () => ({
  useAttendanceContextVersion: () => mocks.contextVersion,
}));

vi.mock('../../services/attendance/absenceAssessmentService', async () => {
  const actual = await vi.importActual<typeof import('../../services/attendance/absenceAssessmentService')>(
    '../../services/attendance/absenceAssessmentService'
  );
  return {
    ...actual,
    listAbsenceAssessments: mocks.list,
  };
});

import { AbsenceAssessmentsTab } from './AbsenceAssessmentsTab';
import { ATTENDANCE_CONTEXT_INVALIDATED } from '../../services/attendance/attendanceContextInvalidation';
import type { AbsenceAssessmentRow } from '../../services/attendance/absenceAssessmentService';

const mockAssessmentRows: AbsenceAssessmentRow[] = [
  {
    riderId: 'r1',
    businessDate: '2026-09-09',
    effectiveStatus: 'on_leave',
    contextCode: 'approved_leave',
    expectedToWork: true,
    isFinalized: true,
    assessmentStatus: 'excused',
    assessmentReason: 'approved_leave',
    policyVersionId: 'policy-1',
    policyVersionNumber: 1,
    policyType: 'provisional',
    attendanceLogId: null,
  },
  {
    riderId: 'r2',
    businessDate: '2026-09-09',
    effectiveStatus: 'absent',
    contextCode: 'no_notice',
    expectedToWork: true,
    isFinalized: true,
    assessmentStatus: 'unexcused',
    assessmentReason: 'no_notice',
    policyVersionId: 'policy-1',
    policyVersionNumber: 1,
    policyType: 'provisional',
    attendanceLogId: null,
  },
];

async function flushEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('AbsenceAssessmentsTab', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.contextVersion = 'realtime-1:0';
    mocks.selectedHubId = 'hub-1';
    mocks.list.mockResolvedValue(mockAssessmentRows);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('renders assessment classifications, reasons, and policy version', async () => {
    await act(async () => {
      root.render(
        <AbsenceAssessmentsTab
          startDate="2026-09-09"
          endDate="2026-09-09"
          riderNames={{ r1: 'Rider One', r2: 'Rider Two' }}
        />
      );
    });
    await flushEffects();

    const text = container.textContent || '';

    // Check Row 1 displays Excused, Approved Leave, V1 · Provisional
    expect(text).toContain('Excused');
    expect(text).toContain('Approved Leave');
    expect(text).toContain('V1 · Provisional');

    // Check Row 2 displays Unexcused, No Notice, V1 · Provisional
    expect(text).toContain('Unexcused');
    expect(text).toContain('No Notice');

    // Check rider names
    expect(text).toContain('Rider One');
    expect(text).toContain('Rider Two');
  });

  it('never displays monetary or disciplinary columns', async () => {
    await act(async () => {
      root.render(
        <AbsenceAssessmentsTab
          startDate="2026-09-09"
          endDate="2026-09-09"
        />
      );
    });
    await flushEffects();

    const text = container.textContent || '';
    expect(text).not.toContain('Deduction');
    expect(text).not.toContain('Penalty');
    expect(text).not.toContain('Amount');
    expect(text).not.toContain('Reason Details');
    expect(text).not.toContain('Review Notes');
  });

  it('filters by assessment status', async () => {
    await act(async () => {
      root.render(
        <AbsenceAssessmentsTab
          startDate="2026-09-09"
          endDate="2026-09-09"
        />
      );
    });
    await flushEffects();

    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        assessmentStatus: null,
      })
    );

    // Click "Excused" filter button
    const buttons = Array.from(container.querySelectorAll('button'));
    const excusedBtn = buttons.find((b) => b.textContent?.trim() === 'Excused');
    expect(excusedBtn).toBeDefined();

    await act(async () => {
      excusedBtn?.click();
    });
    await flushEffects();

    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        assessmentStatus: 'excused',
      })
    );
  });

  it('discards stale responses if filters change before completion (race condition protection)', async () => {
    let resolveFirst: (rows: AbsenceAssessmentRow[]) => void;
    const firstPromise = new Promise<AbsenceAssessmentRow[]>((resolve) => {
      resolveFirst = resolve;
    });

    mocks.list.mockReturnValueOnce(firstPromise);

    await act(async () => {
      root.render(
        <AbsenceAssessmentsTab
          startDate="2026-09-09"
          endDate="2026-09-09"
        />
      );
    });

    // Fast change filter to "Unexcused" before first call finishes
    mocks.list.mockResolvedValueOnce([mockAssessmentRows[1]]);

    const buttons = Array.from(container.querySelectorAll('button'));
    const unexcusedBtn = buttons.find((b) => b.textContent?.trim() === 'Unexcused');

    await act(async () => {
      unexcusedBtn?.click();
    });
    await flushEffects();

    // Now resolve the first call with stale data
    await act(async () => {
      resolveFirst!([mockAssessmentRows[0]]);
    });
    await flushEffects();

    // Stale Row 1 should NOT overwrite the second call result
    const text = container.textContent || '';
    expect(text).toContain('No Notice');
  });

  it('refreshes when invalidation event is dispatched', async () => {
    await act(async () => {
      root.render(
        <AbsenceAssessmentsTab
          startDate="2026-09-09"
          endDate="2026-09-09"
        />
      );
    });
    await flushEffects();

    const initialCallCount = mocks.list.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event(ATTENDANCE_CONTEXT_INVALIDATED));
    });
    await flushEffects();

    expect(mocks.list.mock.calls.length).toBeGreaterThan(initialCallCount);
  });
});
