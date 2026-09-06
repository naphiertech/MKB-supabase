import { describe, it, expect } from 'vitest';
import {
  hasUnderlyingAttendanceLog,
  type AttendanceContextLog,
  type AttendancePresentationLog,
} from '../services/attendance/attendanceContextService';
import type { AttendanceLog } from '../services/types';

describe('Admin Attendance Rate Population Preservation', () => {
  // Simulates 10 raw records in attendance_logs table
  const sampleRawLogs: AttendanceLog[] = [
    {
      id: 'raw-1',
      riderId: 'r-1',
      riderName: 'Rider 1',
      riderAvatar: '',
      date: '2026-09-06',
      timeIn: '08:00',
      timeOut: '17:00',
      hours: 9,
      zoneId: 'z-1',
      zoneName: 'Zone 1',
      status: 'present',
      presence: 'present',
      punctuality: 'on_time',
      source: 'face-scan',
      events: [],
    },
    {
      id: 'raw-2',
      riderId: 'r-2',
      riderName: 'Rider 2',
      riderAvatar: '',
      date: '2026-09-06',
      timeIn: '08:30',
      timeOut: '17:00',
      hours: 8.5,
      zoneId: 'z-1',
      zoneName: 'Zone 1',
      status: 'late',
      presence: 'present',
      punctuality: 'late',
      source: 'face-scan',
      events: [],
    },
    {
      id: 'raw-3',
      riderId: 'r-3',
      riderName: 'Rider 3',
      riderAvatar: '',
      date: '2026-09-06',
      timeIn: null,
      timeOut: null,
      hours: 0,
      zoneId: 'z-1',
      zoneName: 'Zone 1',
      status: 'absent',
      presence: 'absent',
      punctuality: 'none',
      source: 'system',
      events: [],
    },
    {
      id: 'raw-4',
      riderId: 'r-4',
      riderName: 'Rider 4',
      riderAvatar: '',
      date: '2026-09-06',
      timeIn: '07:55',
      timeOut: '16:55',
      hours: 9,
      zoneId: 'z-1',
      zoneName: 'Zone 1',
      status: 'present',
      presence: 'present',
      punctuality: 'on_time',
      source: 'face-scan',
      events: [],
    },
    {
      id: 'raw-5',
      riderId: 'r-5',
      riderName: 'Rider 5',
      riderAvatar: '',
      date: '2026-09-06',
      timeIn: '08:02',
      timeOut: '17:00',
      hours: 8.9,
      zoneId: 'z-1',
      zoneName: 'Zone 1',
      status: 'present',
      presence: 'present',
      punctuality: 'on_time',
      source: 'face-scan',
      events: [],
    },
  ];

  // Helper to calculate rate the way the pre-integration AdminDashboard calculated it
  function calculatePreviousRawRate(logs: AttendanceLog[]) {
    const totalPopulation = logs.length;
    const presentCount = logs.filter((l) => l.status === 'present' || l.status === 'late').length;
    const rate = totalPopulation ? Math.round((presentCount / totalPopulation) * 100) : 0;
    return { totalPopulation, presentCount, rate };
  }

  // Helper to calculate rate the way the post-integration AdminDashboard calculates it
  function calculateNewFilteredRate(logs: AttendancePresentationLog[]) {
    const rawLogs = logs.filter(hasUnderlyingAttendanceLog);
    const totalPopulation = rawLogs.length;
    const presentCount = rawLogs.filter((l) => l.status === 'present' || l.status === 'late').length;
    const rate = totalPopulation ? Math.round((presentCount / totalPopulation) * 100) : 0;
    return { totalPopulation, presentCount, rate, rawLogs };
  }

  it('proves that previous raw population equals new filtered population for equivalent records', () => {
    // Previous baseline
    const previous = calculatePreviousRawRate(sampleRawLogs);
    expect(previous.totalPopulation).toBe(5);
    expect(previous.presentCount).toBe(4); // 3 present + 1 late
    expect(previous.rate).toBe(80);

    // Converted context logs representing the same raw records
    const contextLogsFromRaw: AttendanceContextLog[] = sampleRawLogs.map((raw) => ({
      id: raw.id,
      attendanceLogId: raw.id,
      riderId: raw.riderId,
      riderName: raw.riderName,
      riderAvatar: raw.riderAvatar,
      riderCode: raw.riderId,
      date: raw.date,
      timeIn: raw.timeIn,
      timeOut: raw.timeOut,
      rawTimeIn: raw.timeIn,
      rawTimeOut: raw.timeOut,
      hours: raw.hours,
      zoneId: raw.zoneId,
      zoneName: raw.zoneName,
      rawStatus: raw.status as any,
      status: raw.status as any,
      presence: raw.status as any,
      punctuality: raw.punctuality as any,
      completionState: raw.timeIn ? 'complete' : 'absent',
      source: raw.source,
      lat: null,
      lng: null,
      isFinalized: true,
      expectedToWork: true,
      expectedWorkBasis: 'schedule',
      plannedLeaveState: null,
      plannedLeaveEffective: false,
      plannedLeaveRequestId: null,
      plannedLeaveRequestRevision: null,
      absenceNoticeState: null,
      absenceNoticeEffective: false,
      absenceNoticeRequestId: null,
      absenceNoticeRequestRevision: null,
      excusalState: 'not_applicable',
      contextCode: null,
      contextRequestId: null,
      contextRequestKind: null,
      contextRequestRevision: null,
      hubId: null,
      scheduleId: 'sched-1',
      scheduleDayKind: 'work',
      events: [],
    }));

    // Synthetic context records that do NOT have an underlying raw attendance_logs row
    const syntheticContextLogs: AttendanceContextLog[] = [
      {
        id: null,
        attendanceLogId: null,
        riderId: 'r-6',
        riderName: 'Rider 6 (Day Off)',
        riderAvatar: '',
        riderCode: 'r-6',
        date: '2026-09-06',
        timeIn: null,
        timeOut: null,
        rawTimeIn: null,
        rawTimeOut: null,
        hours: 0,
        zoneId: 'z-1',
        zoneName: 'Zone 1',
        rawStatus: null,
        status: 'day_off',
        presence: 'day_off',
        punctuality: 'none',
        completionState: 'not_expected',
        source: null,
        lat: null,
        lng: null,
        isFinalized: true,
        expectedToWork: false,
        expectedWorkBasis: 'day_off',
        plannedLeaveState: null,
        plannedLeaveEffective: false,
        plannedLeaveRequestId: null,
        plannedLeaveRequestRevision: null,
        absenceNoticeState: null,
        absenceNoticeEffective: false,
        absenceNoticeRequestId: null,
        absenceNoticeRequestRevision: null,
        excusalState: 'not_applicable',
        contextCode: 'published_day_off',
        contextRequestId: null,
        contextRequestKind: null,
        contextRequestRevision: null,
        hubId: null,
        scheduleId: 'sched-2',
        scheduleDayKind: 'day_off',
        events: [],
      },
      {
        id: null,
        attendanceLogId: null,
        riderId: 'r-7',
        riderName: 'Rider 7 (Approved Leave)',
        riderAvatar: '',
        riderCode: 'r-7',
        date: '2026-09-06',
        timeIn: null,
        timeOut: null,
        rawTimeIn: null,
        rawTimeOut: null,
        hours: 0,
        zoneId: 'z-1',
        zoneName: 'Zone 1',
        rawStatus: null,
        status: 'on_leave',
        presence: 'on_leave',
        punctuality: 'none',
        completionState: 'not_expected',
        source: null,
        lat: null,
        lng: null,
        isFinalized: true,
        expectedToWork: false,
        expectedWorkBasis: 'leave',
        plannedLeaveState: 'approved',
        plannedLeaveEffective: true,
        plannedLeaveRequestId: 'leave-1',
        plannedLeaveRequestRevision: 1,
        absenceNoticeState: null,
        absenceNoticeEffective: false,
        absenceNoticeRequestId: null,
        absenceNoticeRequestRevision: null,
        excusalState: 'excused',
        contextCode: 'approved_leave',
        contextRequestId: 'leave-1',
        contextRequestKind: 'planned_leave',
        contextRequestRevision: 1,
        hubId: null,
        scheduleId: 'sched-3',
        scheduleDayKind: 'work',
        events: [],
      },
      {
        id: null,
        attendanceLogId: null,
        riderId: 'r-8',
        riderName: 'Rider 8 (Scheduled but no clock yet)',
        riderAvatar: '',
        riderCode: 'r-8',
        date: '2026-09-06',
        timeIn: null,
        timeOut: null,
        rawTimeIn: null,
        rawTimeOut: null,
        hours: 0,
        zoneId: 'z-1',
        zoneName: 'Zone 1',
        rawStatus: null,
        status: 'absent',
        presence: 'absent',
        punctuality: 'none',
        completionState: 'absent',
        source: null,
        lat: null,
        lng: null,
        isFinalized: false,
        expectedToWork: true,
        expectedWorkBasis: 'schedule',
        plannedLeaveState: null,
        plannedLeaveEffective: false,
        plannedLeaveRequestId: null,
        plannedLeaveRequestRevision: null,
        absenceNoticeState: null,
        absenceNoticeEffective: false,
        absenceNoticeRequestId: null,
        absenceNoticeRequestRevision: null,
        excusalState: 'not_applicable',
        contextCode: 'no_notice',
        contextRequestId: null,
        contextRequestKind: null,
        contextRequestRevision: null,
        hubId: null,
        scheduleId: 'sched-4',
        scheduleDayKind: 'work',
        events: [],
      },
    ];

    // Total post-integration array contains all 8 presentation logs
    const mixedPresentationLogs: AttendancePresentationLog[] = [
      ...contextLogsFromRaw,
      ...syntheticContextLogs,
    ];
    expect(mixedPresentationLogs.length).toBe(8);

    // The new filtered rate uses authoritative indicator hasUnderlyingAttendanceLog
    const postIntegration = calculateNewFilteredRate(mixedPresentationLogs);

    // CRITICAL REGRESSION PROOF:
    // 1. Filtered population equals previous raw population exactly
    expect(postIntegration.totalPopulation).toBe(previous.totalPopulation);
    expect(postIntegration.presentCount).toBe(previous.presentCount);
    expect(postIntegration.rate).toBe(previous.rate);

    // 2. Synthetic rows with attendanceLogId: null are strictly excluded
    expect(postIntegration.rawLogs.every((l) => (l as AttendanceContextLog).attendanceLogId !== null)).toBe(true);
    expect(postIntegration.rawLogs.map((l) => l.id)).toEqual(['raw-1', 'raw-2', 'raw-3', 'raw-4', 'raw-5']);
  });

  it('correctly includes a rider who worked during approved leave because an underlying raw log exists', () => {
    const workedDuringLeaveLog: AttendanceContextLog = {
      id: 'raw-worked-leave',
      attendanceLogId: 'raw-worked-leave',
      riderId: 'r-9',
      riderName: 'Rider 9',
      riderAvatar: '',
      riderCode: 'r-9',
      date: '2026-09-06',
      timeIn: '08:00',
      timeOut: '17:00',
      rawTimeIn: '08:00',
      rawTimeOut: '17:00',
      hours: 9,
      zoneId: 'z-1',
      zoneName: 'Zone 1',
      rawStatus: 'present',
      status: 'present',
      presence: 'present',
      punctuality: 'on_time',
      completionState: 'complete',
      source: 'face-scan',
      lat: null,
      lng: null,
      isFinalized: true,
      expectedToWork: false,
      expectedWorkBasis: 'leave',
      plannedLeaveState: 'approved',
      plannedLeaveEffective: true,
      plannedLeaveRequestId: 'req-1',
      plannedLeaveRequestRevision: 1,
      absenceNoticeState: null,
      absenceNoticeEffective: false,
      absenceNoticeRequestId: null,
      absenceNoticeRequestRevision: null,
      excusalState: 'excused',
      contextCode: 'worked_during_approved_leave',
      contextRequestId: 'req-1',
      contextRequestKind: 'planned_leave',
      contextRequestRevision: 1,
      hubId: null,
      scheduleId: null,
      scheduleDayKind: null,
      events: [],
    };

    expect(hasUnderlyingAttendanceLog(workedDuringLeaveLog)).toBe(true);
  });

  it('correctly handles legacy AttendanceLog objects without attendanceLogId field', () => {
    const legacyLog: AttendanceLog = {
      id: 'legacy-raw-uuid',
      riderId: 'r-legacy',
      riderName: 'Legacy Rider',
      riderAvatar: '',
      date: '2026-09-06',
      timeIn: '08:00',
      timeOut: '17:00',
      hours: 9,
      zoneId: 'z-1',
      zoneName: 'Zone 1',
      status: 'present',
      presence: 'present',
      punctuality: 'on_time',
      source: 'face-scan',
      events: [],
    };

    expect(hasUnderlyingAttendanceLog(legacyLog)).toBe(true);
  });
});
