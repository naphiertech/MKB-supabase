import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkHasActiveAttendance } from './riderAttendanceCheck';
import { supabase } from '../../lib/supabaseClient';
import * as riderCacheService from './riderCacheService';

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('./riderCacheService', () => ({
  getCachedRiderDashboard: vi.fn(),
}));

describe('riderAttendanceCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false if riderId is empty', async () => {
    const result = await checkHasActiveAttendance('');
    expect(result).toBe(false);
  });

  it('returns true when rider has an active session online (time_in present, time_out null)', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'att-1', time_in: '08:00:00', time_out: null },
      error: null,
    });
    const mockEqDate = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockEqRider = vi.fn().mockReturnValue({ eq: mockEqDate });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqRider });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as unknown as ReturnType<typeof supabase.from>);

    const result = await checkHasActiveAttendance('rider-123', 'user-123');
    expect(result).toBe(true);
  });

  it('returns false when rider has completed shift online (time_in and time_out both present)', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'att-1', time_in: '08:00:00', time_out: '17:00:00' },
      error: null,
    });
    const mockEqDate = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockEqRider = vi.fn().mockReturnValue({ eq: mockEqDate });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqRider });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as unknown as ReturnType<typeof supabase.from>);

    const result = await checkHasActiveAttendance('rider-123', 'user-123');
    expect(result).toBe(false);
  });

  it('returns false when rider has no attendance record for today online', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const mockEqDate = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockEqRider = vi.fn().mockReturnValue({ eq: mockEqDate });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqRider });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as unknown as ReturnType<typeof supabase.from>);

    const result = await checkHasActiveAttendance('rider-123', 'user-123');
    expect(result).toBe(false);
  });

  it('falls back to offline cache when supabase query throws and cached shift is active', async () => {
    const mockMaybeSingle = vi.fn().mockRejectedValue(new Error('Network offline'));
    const mockEqDate = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockEqRider = vi.fn().mockReturnValue({ eq: mockEqDate });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqRider });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as unknown as ReturnType<typeof supabase.from>);

    vi.mocked(riderCacheService.getCachedRiderDashboard).mockResolvedValue({
      resolvedRiderId: 'rider-123',
      dbUser: null,
      dbRider: null,
      todayAttendance: {
        id: 'att-cached',
        rider_id: 'rider-123',
        date: '2026-08-19',
        time_in: '09:00:00',
        time_out: null,
        hours: null,
        status: 'present',
      },
      latestViolation: null,
      monthAttendance: [],
      monthViolationCount: 0,
      timestamp: Date.now(),
    });

    const result = await checkHasActiveAttendance('rider-123', 'user-123');
    expect(result).toBe(true);
  });
});
