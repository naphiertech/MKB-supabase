import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAttendanceLogs: vi.fn(),
  getViolationsForReport: vi.fn(),
}));

vi.mock('./attendanceService', () => ({ getAttendanceLogs: mocks.getAttendanceLogs }));
vi.mock('./monitoringService', () => ({ getViolationsForReport: mocks.getViolationsForReport }));
vi.mock('./historicalAttendanceContext', () => ({ enrichAttendanceWithHistoricalZones: (logs: unknown[]) => Promise.resolve(logs) }));

import { loadReportsData } from './reportsDataService';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAttendanceLogs.mockResolvedValue([]);
  mocks.getViolationsForReport.mockResolvedValue([]);
});

describe('fresh Reports dataset loading', () => {
  it('loads selected and equally sized previous periods before historical Zone filtering', async () => {
    await loadReportsData({ from: '2026-08-01', to: '2026-08-15', hubId: 'hub-a', zoneId: 'zone-a' });
    const options = { finalizeDaily: false, throwOnError: true, includeEvents: false };
    expect(mocks.getAttendanceLogs).toHaveBeenNthCalledWith(1, {
      dateFrom: '2026-08-01', dateTo: '2026-08-15',
    }, options);
    expect(mocks.getAttendanceLogs).toHaveBeenNthCalledWith(2, {
      dateFrom: '2026-07-17', dateTo: '2026-07-31',
    }, options);
    expect(mocks.getViolationsForReport).toHaveBeenNthCalledWith(1, {
      from: '2026-08-01', to: '2026-08-15', zoneIds: ['zone-a'],
    });
    expect(mocks.getViolationsForReport).toHaveBeenNthCalledWith(2, {
      from: '2026-07-17', to: '2026-07-31', zoneIds: ['zone-a'],
    });
  });

  it('uses authorized all-Zone reads when All Zones is selected', async () => {
    await loadReportsData({ from: '2026-08-01', to: '2026-08-15', hubId: null, zoneId: 'all' });
    expect(mocks.getAttendanceLogs.mock.calls[0][0].zoneId).toBeUndefined();
    expect(mocks.getViolationsForReport.mock.calls[0][0].zoneIds).toEqual([]);
  });
});
