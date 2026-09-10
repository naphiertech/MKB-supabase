// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Attendance } from './Attendance';
import type { AttendanceContextLog } from '../services/attendance/attendanceContextService';
import { getLocalDateString } from '../services/attendance/attendanceService';

const mocks = vi.hoisted(() => ({
  listAttendanceContext: vi.fn(),
  getAttendanceLogs: vi.fn(),
  getZones: vi.fn(),
  getRidersLookup: vi.fn(),
}));

vi.mock('../hooks/useAttendanceContextVersion', () => ({
  useAttendanceContextVersion: () => 0,
}));

vi.mock('../components/common/StatCard', () => ({
  StatCard: ({ label, value, onClick }: { label: string; value: React.ReactNode; onClick?: () => void }) => (
    <div data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`} onClick={onClick}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  ),
}));

vi.mock('../services/geofencing/geofenceService', () => ({
  getZones: mocks.getZones,
}));

vi.mock('../services/riders/riderService', () => ({
  getRidersLookup: mocks.getRidersLookup,
}));

vi.mock('../hooks/useToast', () => ({
  appToast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock('../services/attendance/dtrParserService', () => ({
  parseDTRPdf: vi.fn(),
  saveImportedLogs: vi.fn(),
}));

vi.mock('../lib/exports/employeeExport', () => ({
  exportEmployeeDTR: vi.fn(),
}));

vi.mock('../lib/exports/attendanceExport', () => ({
  exportAttendanceCsv: vi.fn(),
  exportAttendancePdf: vi.fn(),
}));

vi.mock('../services/attendance/attendanceContextService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/attendance/attendanceContextService')>();
  return {
    ...actual,
    listAttendanceContext: mocks.listAttendanceContext,
  };
});

vi.mock('../services/attendance/attendanceService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/attendance/attendanceService')>();
  return {
    ...actual,
    getAttendanceLogs: mocks.getAttendanceLogs,
  };
});

function createMockLog(params: {
  id: string;
  riderId: string;
  riderName: string;
  date: string;
  timeIn: string | null;
  timeOut: string | null;
  status: 'present' | 'late' | 'absent' | 'on_leave' | 'day_off';
  punctuality: 'on_time' | 'late' | 'none';
  contextCode?: any;
}): AttendanceContextLog {
  return {
    id: params.id,
    attendanceLogId: params.id,
    riderId: params.riderId,
    riderName: params.riderName,
    riderAvatar: '',
    riderCode: `MKB-${params.riderId}`,
    date: params.date,
    timeIn: params.timeIn,
    timeOut: params.timeOut,
    rawTimeIn: params.timeIn ? `${params.date}T${params.timeIn}:00.000Z` : null,
    rawTimeOut: params.timeOut ? `${params.date}T${params.timeOut}:00.000Z` : null,
    hours: params.timeIn && params.timeOut ? 8 : 0,
    zoneId: 'zone-1',
    zoneName: 'Main Zone',
    rawStatus: params.status === 'day_off' ? null : (params.status as any),
    status: params.status,
    presence: params.status,
    punctuality: params.punctuality,
    completionState: params.timeIn ? (params.timeOut ? 'complete' : 'active') : 'absent',
    source: params.timeIn ? 'face-scan' : 'system',
    lat: 6.9,
    lng: 122.0,
    isFinalized: false,
    expectedToWork: params.status !== 'day_off',
    expectedWorkBasis: 'roster',
    plannedLeaveState: null,
    plannedLeaveEffective: false,
    plannedLeaveRequestId: null,
    plannedLeaveRequestRevision: null,
    absenceNoticeState: null,
    absenceNoticeEffective: false,
    absenceNoticeRequestId: null,
    absenceNoticeRequestRevision: null,
    excusalState: 'not_applicable',
    contextCode: params.contextCode || null,
    contextRequestId: null,
    contextRequestKind: null,
    contextRequestRevision: null,
    hubId: 'hub-1',
    scheduleId: null,
    scheduleDayKind: null,
    events: [],
  };
}

describe('Attendance presence semantics (Attendance page)', () => {
  let container: HTMLDivElement;
  let root: Root;
  const today = getLocalDateString();

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.getZones.mockResolvedValue([{ id: 'zone-1', name: 'Main Zone' }]);
    mocks.getRidersLookup.mockResolvedValue([]);
    mocks.getAttendanceLogs.mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('1. Present filter includes Late: shows on-time and late riders while hiding absent riders', async () => {
    const onTimeRider = createMockLog({
      id: 'log-1',
      riderId: 'rider-1',
      riderName: 'Juan OnTime',
      date: today,
      timeIn: '08:00',
      timeOut: null,
      status: 'present',
      punctuality: 'on_time',
    });
    const lateRider = createMockLog({
      id: 'log-2',
      riderId: 'rider-2',
      riderName: 'Pedro Late',
      date: today,
      timeIn: '08:45',
      timeOut: null,
      status: 'late',
      punctuality: 'late',
    });
    const absentRider = createMockLog({
      id: 'log-3',
      riderId: 'rider-3',
      riderName: 'Maria Absent',
      date: today,
      timeIn: null,
      timeOut: null,
      status: 'absent',
      punctuality: 'none',
    });

    mocks.listAttendanceContext.mockResolvedValue([onTimeRider, lateRider, absentRider]);

    await act(async () => {
      root.render(<Attendance />);
    });

    // Default status filter is "present"
    const text = container.textContent || '';
    expect(text).toContain('Juan OnTime');
    expect(text).toContain('Pedro Late');
    expect(text).not.toContain('Maria Absent');
  });

  it('2. Present + Late punctuality narrows visibility to late riders who attended', async () => {
    const onTimeRider = createMockLog({
      id: 'log-1',
      riderId: 'rider-1',
      riderName: 'Juan OnTime',
      date: today,
      timeIn: '08:00',
      timeOut: null,
      status: 'present',
      punctuality: 'on_time',
    });
    const lateRider = createMockLog({
      id: 'log-2',
      riderId: 'rider-2',
      riderName: 'Pedro Late',
      date: today,
      timeIn: '08:45',
      timeOut: null,
      status: 'late',
      punctuality: 'late',
    });

    mocks.listAttendanceContext.mockResolvedValue([onTimeRider, lateRider]);

    await act(async () => {
      root.render(<Attendance />);
    });

    // Change punctuality filter to "late"
    const punctualitySelect = container.querySelectorAll('select')[2]; // Zone is 0, Status is 1, Punctuality is 2
    await act(async () => {
      punctualitySelect.value = 'late';
      punctualitySelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const text = container.textContent || '';
    expect(text).toContain('Pedro Late');
    expect(text).not.toContain('Juan OnTime');
  });

  it('3. Present Today KPI counts all attendees (2 on-time + 1 late = 3 present, 1 late, 0 absent)', async () => {
    const rider1 = createMockLog({
      id: 'log-1',
      riderId: 'rider-1',
      riderName: 'Rider One',
      date: today,
      timeIn: '07:55',
      timeOut: null,
      status: 'present',
      punctuality: 'on_time',
    });
    const rider2 = createMockLog({
      id: 'log-2',
      riderId: 'rider-2',
      riderName: 'Rider Two',
      date: today,
      timeIn: '08:00',
      timeOut: null,
      status: 'present',
      punctuality: 'on_time',
    });
    const rider3Late = createMockLog({
      id: 'log-3',
      riderId: 'rider-3',
      riderName: 'Rider Three Late',
      date: today,
      timeIn: '08:35',
      timeOut: null,
      status: 'late',
      punctuality: 'late',
    });

    mocks.listAttendanceContext.mockResolvedValue([rider1, rider2, rider3Late]);

    await act(async () => {
      root.render(<Attendance />);
    });

    // Find the StatCards
    const presentCard = container.querySelector('[data-testid="stat-present-today"]');
    const lateCard = container.querySelector('[data-testid="stat-late-today"]');
    const absentCard = container.querySelector('[data-testid="stat-absent"]');

    expect(presentCard?.textContent).toContain('Present Today');
    expect(presentCard?.textContent).toContain('3');

    expect(lateCard?.textContent).toContain('Late Today');
    expect(lateCard?.textContent).toContain('1');

    expect(absentCard?.textContent).toContain('Absent');
    expect(absentCard?.textContent).toContain('0');
  });

  it('4. Late remains visually Late: renders Late status/pill and Late punctuality, not converted to On Time', async () => {
    const lateRider = createMockLog({
      id: 'log-2',
      riderId: 'rider-2',
      riderName: 'Pedro Late',
      date: today,
      timeIn: '13:44',
      timeOut: '13:46',
      status: 'late',
      punctuality: 'late',
    });

    // Set filter to "all" or keep "present"
    mocks.listAttendanceContext.mockResolvedValue([lateRider]);

    await act(async () => {
      root.render(<Attendance />);
    });

    // In the table row:
    const row = container.querySelector('tbody tr');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('Pedro Late');
    expect(row!.textContent).toContain('Late');
    expect(row!.textContent).not.toContain('On Time');
  });

  it('5. Absent / Leave / Day Off exclusion: Present filter hides absent, on_leave, day_off', async () => {
    const absentRider = createMockLog({
      id: 'log-1',
      riderId: 'rider-1',
      riderName: 'Absent Rider',
      date: today,
      timeIn: null,
      timeOut: null,
      status: 'absent',
      punctuality: 'none',
    });
    const leaveRider = createMockLog({
      id: 'log-2',
      riderId: 'rider-2',
      riderName: 'Leave Rider',
      date: today,
      timeIn: null,
      timeOut: null,
      status: 'on_leave',
      punctuality: 'none',
      contextCode: 'approved_leave',
    });
    const dayOffRider = createMockLog({
      id: 'log-3',
      riderId: 'rider-3',
      riderName: 'DayOff Rider',
      date: today,
      timeIn: null,
      timeOut: null,
      status: 'day_off',
      punctuality: 'none',
      contextCode: 'published_day_off',
    });

    mocks.listAttendanceContext.mockResolvedValue([absentRider, leaveRider, dayOffRider]);

    await act(async () => {
      root.render(<Attendance />);
    });

    const text = container.textContent || '';
    expect(text).not.toContain('Absent Rider');
    expect(text).not.toContain('Leave Rider');
    expect(text).not.toContain('DayOff Rider');
  });

  it('6. Actual-clock precedence: Late actual attendance counts as Present despite Leave context', async () => {
    const workedLeaveLate = createMockLog({
      id: 'log-1',
      riderId: 'rider-1',
      riderName: 'Worked Leave Rider',
      date: today,
      timeIn: '08:40',
      timeOut: null,
      status: 'late',
      punctuality: 'late',
      contextCode: 'worked_during_approved_leave',
    });

    mocks.listAttendanceContext.mockResolvedValue([workedLeaveLate]);

    await act(async () => {
      root.render(<Attendance />);
    });

    // Default status filter is "present" -> row MUST remain visible!
    const text = container.textContent || '';
    expect(text).toContain('Worked Leave Rider');
    expect(text).toContain('Worked During Approved Leave');
    expect(text).toContain('Late');
  });

  it('7. AttendanceDetailsPanel details: Present panel includes late riders; Late panel includes only late riders', async () => {
    const onTimeRider = createMockLog({
      id: 'log-1',
      riderId: 'rider-1',
      riderName: 'Juan OnTime',
      date: today,
      timeIn: '08:00',
      timeOut: null,
      status: 'present',
      punctuality: 'on_time',
    });
    const lateRider = createMockLog({
      id: 'log-2',
      riderId: 'rider-2',
      riderName: 'Pedro Late',
      date: today,
      timeIn: '08:45',
      timeOut: null,
      status: 'late',
      punctuality: 'late',
    });

    mocks.listAttendanceContext.mockResolvedValue([onTimeRider, lateRider]);

    await act(async () => {
      root.render(<Attendance />);
    });

    // Click Present Today card to open details panel
    const presentCard = container.querySelector('[data-testid="stat-present-today"]');
    await act(async () => {
      presentCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // In Present panel: both Juan OnTime and Pedro Late should be present
    const presentPanel = container.querySelector('.animate-in');
    expect(presentPanel?.textContent).toContain('Riders Present Today');
    expect(presentPanel?.textContent).toContain('Juan OnTime');
    expect(presentPanel?.textContent).toContain('Pedro Late');

    // Click Late Today card to switch to Late panel
    const lateCard = container.querySelector('[data-testid="stat-late-today"]');
    await act(async () => {
      lateCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // In Late panel: only Pedro Late should be present
    const latePanel = container.querySelector('.animate-in');
    expect(latePanel?.textContent).toContain('Riders Late Today');
    expect(latePanel?.textContent).toContain('Pedro Late');
    expect(latePanel?.textContent).not.toContain('Juan OnTime');
  });
});
