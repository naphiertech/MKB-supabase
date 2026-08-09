import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ logViolation: vi.fn(), logActivity: vi.fn() }));
vi.mock('./monitoringService', () => ({ logViolation: mocks.logViolation }));
vi.mock('../lib/apiService', () => ({ logActivity: mocks.logActivity }));

import { createLiveMonitoringManualFlag, phoneHref } from './liveMonitoringActions';

beforeEach(() => vi.clearAllMocks());

describe('live monitoring actions', () => {
  it('builds a device dialer link only when a phone number exists', () => {
    expect(phoneHref('+63 917 123 4567')).toBe('tel:+639171234567');
    expect(phoneHref('')).toBeNull();
    expect(phoneHref(null)).toBeNull();
  });

  it('reuses the persisted manual_flag violation type and audits the reason', async () => {
    mocks.logViolation.mockResolvedValue(undefined);
    mocks.logActivity.mockResolvedValue(undefined);
    await createLiveMonitoringManualFlag({ riderId: 'rider-1', riderName: 'Rider One', zoneId: 'zone-1', zoneName: 'Zone One', lat: 6.9, lng: 122.1, reason: 'Needs follow-up' });
    expect(mocks.logViolation).toHaveBeenCalledWith(expect.objectContaining({ type: 'manual_flag', riderId: 'rider-1' }));
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'manual_flag_created', riderId: 'rider-1' }));
  });
});
