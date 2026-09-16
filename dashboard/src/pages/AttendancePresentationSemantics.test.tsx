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

describe('Attendance status and punctuality presentation semantics', () => {
  let container: HTMLDivElement;
  let root: Root;
  const today = getLocalDateString();

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    mocks.getZones.mockResolvedValue([
      { id: 'zone-1', name: 'Main Zone', code: 'MZ', coordinates: [] },
    ]);
    mocks.getRidersLookup.mockResolvedValue([
      { id: 'rider-1', name: 'Naphier Awalie', zone_id: 'zone-1' },
    ]);
    mocks.getAttendanceLogs.mockResolvedValue([]);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('1. Late attendance row renders Status = Present and Punctuality = Late (NOT Status = Late)', async () => {
    const lateRider = createMockLog({
      id: 'log-late-1',
      riderId: 'rider-1',
      riderName: 'Naphier Awalie',
      date: today,
      timeIn: '10:17',
      timeOut: '10:20',
      status: 'late',
      punctuality: 'late',
    });

    mocks.listAttendanceContext.mockResolvedValue([lateRider]);

    await act(async () => {
      root.render(<Attendance />);
    });

    const row = container.querySelector('tbody tr');
    expect(row).not.toBeNull();
    const cells = row!.querySelectorAll('td');

    // Cell 5 is Status (Presence), Cell 6 is Punctuality
    expect(cells[5].textContent).toContain('Present');
    expect(cells[5].textContent).not.toContain('Late');
    expect(cells[6].textContent).toContain('Late');
  });

  it('2. On-time attendance row renders Status = Present and Punctuality = On Time', async () => {
    const onTimeRider = createMockLog({
      id: 'log-ontime-1',
      riderId: 'rider-2',
      riderName: 'Juan OnTime',
      date: today,
      timeIn: '08:00',
      timeOut: '17:00',
      status: 'present',
      punctuality: 'on_time',
    });

    mocks.listAttendanceContext.mockResolvedValue([onTimeRider]);

    await act(async () => {
      root.render(<Attendance />);
    });

    const row = container.querySelector('tbody tr');
    expect(row).not.toBeNull();
    const cells = row!.querySelectorAll('td');

    expect(cells[5].textContent).toContain('Present');
    expect(cells[6].textContent).toContain('On Time');
  });

  it('3. Approved Leave with no clocks renders Status = On Leave', async () => {
    const leaveRider = createMockLog({
      id: 'log-leave-1',
      riderId: 'rider-3',
      riderName: 'Maria Leave',
      date: today,
      timeIn: null,
      timeOut: null,
      status: 'on_leave',
      punctuality: 'none',
      contextCode: 'approved_leave',
    });

    mocks.listAttendanceContext.mockResolvedValue([leaveRider]);

    await act(async () => {
      root.render(<Attendance />);
    });

    // Change status filter to 'on_leave' to view the row
    const statusSelect = container.querySelectorAll('select')[1];
    await act(async () => {
      statusSelect.value = 'on_leave';
      statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const row = container.querySelector('tbody tr');
    expect(row).not.toBeNull();
    const cells = row!.querySelectorAll('td');

    expect(cells[5].textContent).toContain('On Leave');
    expect(cells[5].textContent).toContain('Approved Leave');
    expect(cells[6].textContent).toContain('—');
  });

  it('4. Accepted Notice with no clocks renders Status = Absent', async () => {
    const absentNoticeRider = createMockLog({
      id: 'log-absent-1',
      riderId: 'rider-4',
      riderName: 'Carlos Notice',
      date: today,
      timeIn: null,
      timeOut: null,
      status: 'absent',
      punctuality: 'none',
      contextCode: 'accepted_notice',
    });

    mocks.listAttendanceContext.mockResolvedValue([absentNoticeRider]);

    await act(async () => {
      root.render(<Attendance />);
    });

    // Change status filter to 'absent' to view the row
    const statusSelect = container.querySelectorAll('select')[1];
    await act(async () => {
      statusSelect.value = 'absent';
      statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const row = container.querySelector('tbody tr');
    expect(row).not.toBeNull();
    const cells = row!.querySelectorAll('td');

    expect(cells[5].textContent).toContain('Absent');
    expect(cells[5].textContent).toContain('Accepted Notice');
    expect(cells[6].textContent).toContain('—');
  });

  it('5. Published Day Off without clocks renders Status = Day Off', async () => {
    const dayOffRider = createMockLog({
      id: 'log-dayoff-1',
      riderId: 'rider-5',
      riderName: 'Elena DayOff',
      date: today,
      timeIn: null,
      timeOut: null,
      status: 'day_off',
      punctuality: 'none',
      contextCode: 'published_day_off',
    });

    mocks.listAttendanceContext.mockResolvedValue([dayOffRider]);

    await act(async () => {
      root.render(<Attendance />);
    });

    // Change status filter to 'all' to view the row
    const statusSelect = container.querySelectorAll('select')[1];
    await act(async () => {
      statusSelect.value = 'all';
      statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const row = container.querySelector('tbody tr');
    expect(row).not.toBeNull();
    const cells = row!.querySelectorAll('td');

    expect(cells[5].textContent).toContain('Day Off');
    expect(cells[5].textContent).toContain('Published Day Off');
    expect(cells[6].textContent).toContain('—');
  });

  it('6. Actual clock + Approved Leave renders Status = Present and retains context', async () => {
    const workedLeaveRider = createMockLog({
      id: 'log-worked-leave-1',
      riderId: 'rider-6',
      riderName: 'Rosa WorkedLeave',
      date: today,
      timeIn: '08:30',
      timeOut: '17:00',
      status: 'present',
      punctuality: 'late',
      contextCode: 'worked_during_approved_leave',
    });

    mocks.listAttendanceContext.mockResolvedValue([workedLeaveRider]);

    await act(async () => {
      root.render(<Attendance />);
    });

    const row = container.querySelector('tbody tr');
    expect(row).not.toBeNull();
    const cells = row!.querySelectorAll('td');

    expect(cells[5].textContent).toContain('Present');
    expect(cells[5].textContent).toContain('Worked During Approved Leave');
    expect(cells[6].textContent).toContain('Late');
  });

  it('7. Actual clock + Accepted Notice renders Status = Present and retains context', async () => {
    const workedNoticeRider = createMockLog({
      id: 'log-worked-notice-1',
      riderId: 'rider-7',
      riderName: 'Danilo WorkedNotice',
      date: today,
      timeIn: '08:00',
      timeOut: '17:00',
      status: 'present',
      punctuality: 'on_time',
      contextCode: 'worked_despite_accepted_notice',
    });

    mocks.listAttendanceContext.mockResolvedValue([workedNoticeRider]);

    await act(async () => {
      root.render(<Attendance />);
    });

    const row = container.querySelector('tbody tr');
    expect(row).not.toBeNull();
    const cells = row!.querySelectorAll('td');

    expect(cells[5].textContent).toContain('Present');
    expect(cells[5].textContent).toContain('Worked Despite Accepted Notice');
    expect(cells[6].textContent).toContain('On Time');
  });

  it('8. Present filter still includes Late riders', async () => {
    const onTimeRider = createMockLog({
      id: 'log-1',
      riderId: 'rider-1',
      riderName: 'Juan OnTime',
      date: today,
      timeIn: '08:00',
      timeOut: '17:00',
      status: 'present',
      punctuality: 'on_time',
    });
    const lateRider = createMockLog({
      id: 'log-2',
      riderId: 'rider-2',
      riderName: 'Pedro Late',
      date: today,
      timeIn: '08:45',
      timeOut: '17:00',
      status: 'late',
      punctuality: 'late',
    });
    const absentRider = createMockLog({
      id: 'log-3',
      riderId: 'rider-3',
      riderName: 'Absent Rider',
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
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(container.textContent).toContain('Juan OnTime');
    expect(container.textContent).toContain('Pedro Late');
    expect(container.textContent).not.toContain('Absent Rider');
  });

  it('9. Late Today KPI remains unchanged (late subset of Present Today)', async () => {
    const onTime1 = createMockLog({
      id: 'log-1',
      riderId: 'rider-1',
      riderName: 'Rider One',
      date: today,
      timeIn: '08:00',
      timeOut: '17:00',
      status: 'present',
      punctuality: 'on_time',
    });
    const onTime2 = createMockLog({
      id: 'log-2',
      riderId: 'rider-2',
      riderName: 'Rider Two',
      date: today,
      timeIn: '08:05',
      timeOut: '17:00',
      status: 'present',
      punctuality: 'on_time',
    });
    const late1 = createMockLog({
      id: 'log-3',
      riderId: 'rider-3',
      riderName: 'Rider Three',
      date: today,
      timeIn: '08:35',
      timeOut: '17:00',
      status: 'late',
      punctuality: 'late',
    });

    mocks.listAttendanceContext.mockResolvedValue([onTime1, onTime2, late1]);

    await act(async () => {
      root.render(<Attendance />);
    });

    const presentCard = container.querySelector('[data-testid="stat-present-today"] .stat-value');
    const lateCard = container.querySelector('[data-testid="stat-late-today"] .stat-value');
    const absentCard = container.querySelector('[data-testid="stat-absent"] .stat-value');

    expect(presentCard?.textContent).toContain('3');
    expect(lateCard?.textContent).toContain('1');
    expect(absentCard?.textContent).toContain('0');
  });
});
