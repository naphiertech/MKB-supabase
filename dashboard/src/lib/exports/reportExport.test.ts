// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViolationEvent } from '../../services/types';

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

import { buildViolationSummary, generateReport } from './reportExport';

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
      { finalizeDaily: false },
    );
    expect(mocks.getViolationsForReport).toHaveBeenCalledWith({ from: '2026-08-01', to: '2026-08-15', zoneIds: ['zone-1'] });
    expect(mocks.getViolations).not.toHaveBeenCalled();
  });
});
