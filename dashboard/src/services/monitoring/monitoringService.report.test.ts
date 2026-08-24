import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('../../lib/supabaseClient', () => ({ supabase: { from: mocks.from } }));
vi.mock('../workforce/workforceDirectoryService', () => ({ getRiderWorkforceDirectory: vi.fn().mockResolvedValue([]) }));
vi.mock('../../lib/avatarCache', () => ({ getCachedAvatar: vi.fn(), setCachedAvatar: vi.fn(), fetchRiderAvatar: vi.fn() }));
vi.mock('../../lib/storage', () => ({ createSyncOperationId: vi.fn(), getStorageAdapter: vi.fn() }));
vi.mock('../notifications/notificationService', () => ({ dispatchNotificationSafe: vi.fn() }));

import * as monitoringService from './monitoringService';

beforeEach(() => vi.clearAllMocks());

describe('complete authorized violation report retrieval', () => {
  it('paginates the selected date/zone range and maps event snapshot fields', async () => {
    const makeRow = (index: number) => ({
      id: `v-${index}`, rider_id: 'r-1', zone_id: 'historical-zone', zone_name: 'Historical Zone',
      created_at: '2026-08-10T10:00:00.000Z', type: 'boundary_exit', read: true,
      lat: 7.1, lng: 122.2, riders: { name: 'Juan' }, resolved: false, resolved_at: null,
    });
    const pages = [Array.from({ length: 500 }, (_, index) => makeRow(index)), [makeRow(500)]];
    const query = {
      select: vi.fn(), gte: vi.fn(), lte: vi.fn(), in: vi.fn(), order: vi.fn(), range: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.gte.mockReturnValue(query);
    query.lte.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.range.mockImplementation(async () => ({ data: pages.shift() ?? [], error: null }));
    mocks.from.mockReturnValue(query);

    const getViolationsForReport = (monitoringService as typeof monitoringService & {
      getViolationsForReport?: (options: { from: string; to: string; zoneIds: string[] }) => Promise<Array<{ zoneId?: string; resolved?: boolean; lat?: number; lng?: number }>>;
    }).getViolationsForReport;
    expect(typeof getViolationsForReport).toBe('function');
    const result = await getViolationsForReport?.({ from: '2026-08-01', to: '2026-08-15', zoneIds: ['historical-zone'] });

    expect(result).toHaveLength(501);
    expect(query.range).toHaveBeenNthCalledWith(1, 0, 499);
    expect(query.range).toHaveBeenNthCalledWith(2, 500, 999);
    expect(query.gte).toHaveBeenCalledWith('created_at', expect.stringContaining('2026-08-01'));
    expect(query.lte).toHaveBeenCalledWith('created_at', expect.stringContaining('2026-08-15'));
    expect(query.in).toHaveBeenCalledWith('zone_id', ['historical-zone']);
    expect(result?.[0]).toMatchObject({ zoneId: 'historical-zone', resolved: false, lat: 7.1, lng: 122.2 });
  });
});
