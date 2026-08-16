// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttendanceLog, ViolationEvent } from '../../services/types';

const mocks = vi.hoisted(() => ({
  getAttendanceLogs: vi.fn(),
  getAllRiders: vi.fn(),
  getZones: vi.fn(),
  getViolations: vi.fn(),
  getViolationsForReport: vi.fn(),
}));

vi.mock('../../services/attendanceService', () => ({ getAttendanceLogs: mocks.getAttendanceLogs }));
vi.mock('../../services/monitoringService', () => ({
  getAllRiders: mocks.getAllRiders,
  getViolations: mocks.getViolations,
  getViolationsForReport: mocks.getViolationsForReport,
}));
vi.mock('../../services/geofenceService', () => ({ getZones: mocks.getZones }));
vi.mock('../../services/historicalAttendanceContext', () => ({ enrichAttendanceWithHistoricalZones: (logs: unknown[]) => Promise.resolve(logs) }));

import { buildRiderPerformance, buildViolationSummary, buildZoneCoverage, generateReport } from './reportExport';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAttendanceLogs.mockResolvedValue([]);
  mocks.getAllRiders.mockResolvedValue([]);
  mocks.getZones.mockResolvedValue([]);
  mocks.getViolations.mockResolvedValue([]);
  mocks.getViolationsForReport.mockResolvedValue([]);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

describe('violation report event fidelity', () => {
  it('uses historical violation zone, event coordinates, and actual resolution status', () => {
    const violation = {
      id: 'v1', riderId: 'r1', riderName: 'Juan', zoneId: 'historical-zone', zoneName: 'Historical Zone',
      ts: new Date('2026-08-10T10:00:00').getTime(), type: 'boundary_exit', read: true,
      resolved: false, lat: 7.12345, lng: 122.54321,
    } as ViolationEvent;
    const report = buildViolationSummary(
      { from: '2026-08-01', to: '2026-08-15', zoneIds: ['historical-zone'] },
      [violation],
    );

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0][1]).toBe('Historical Zone');
    expect(report.rows[0][3]).toBe('7.1235, 122.5432');
    expect(report.rows[0][4]).toBe('N');
  });
});

describe('read-only report generation', () => {
  it('scopes attendance and violation reads without attendance finalization', async () => {
    mocks.getViolationsForReport.mockResolvedValue([{
      id: 'v1', riderId: 'r1', riderName: 'Juan', zoneId: 'zone-1', zoneName: 'North',
      ts: new Date('2026-08-10T10:00:00').getTime(), type: 'boundary_exit', read: false, resolved: false,
      lat: 7, lng: 122,
    }]);

    await generateReport({ from: '2026-08-01', to: '2026-08-15', zoneIds: ['zone-1'], template: 'violation_summary', format: 'csv' });

    expect(mocks.getAttendanceLogs).toHaveBeenCalledWith(
      { dateFrom: '2026-08-01', dateTo: '2026-08-15' },
      { finalizeDaily: false, includeEvents: false },
    );
    expect(mocks.getViolationsForReport).toHaveBeenCalledWith({ from: '2026-08-01', to: '2026-08-15', zoneIds: ['zone-1'] });
    expect(mocks.getViolations).not.toHaveBeenCalled();
    expect(mocks.getAllRiders).not.toHaveBeenCalled();
  });
});

describe('historical report derivation', () => {
  const log: AttendanceLog = {
    id: 'a1', riderId: 'r1', riderName: 'Juan', riderAvatar: '', date: '2026-08-01',
    timeIn: '08:00', timeOut: '17:00', hours: 9, zoneId: 'historical-zone', zoneName: 'Historical Zone',
    status: 'present', presence: 'present', punctuality: 'on_time', source: 'face-scan', events: [],
  };

  it('counts Riders reporting in historical attendance instead of current Zone assignments', () => {
    const report = buildZoneCoverage(
      { from: '2026-08-01', to: '2026-08-15', zoneIds: [] },
      [log],
      [{ id: 'historical-zone', name: 'Historical Zone', center: [0, 0], radius: 100, color: '#000' }],
      [],
    );
    expect(report.columns[1]).toBe('Riders Reporting');
    expect(report.rows[0][1]).toBe(1);
  });

  it('does not fabricate zero rows for Riders absent from the selected report dataset', () => {
    const report = buildRiderPerformance(
      { from: '2026-08-01', to: '2026-08-15', zoneIds: [] },
      [log],
      [],
    );
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0][0]).toBe('Juan');
    expect(report.rows[0][5]).toBe('100%');
  });
});
