import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: mocks.from },
}));

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  LEGACY_NOTIFICATION_PREFERENCE_KEYS,
  loadNotificationPreferences,
  readLegacyNotificationPreferences,
  updateNotificationPreferences,
} from './notificationPreferenceService';

function storage(values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    removeItem: vi.fn((key: string) => { data.delete(key); }),
  };
}

const record = {
  user_id: 'user-1',
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  created_at: '2026-08-09T12:00:00Z',
  updated_at: '2026-08-09T12:00:00Z',
};

beforeEach(() => vi.clearAllMocks());

describe('legacy notification preference migration', () => {
  it('maps only active legacy presentation settings and ignores the fake weekly digest', () => {
    const legacy = storage({
      notif_boundary_user: 'false',
      notif_attendance_user: 'true',
      notif_sound_user: 'false',
      notif_push_user: 'false',
      notif_reports_user: 'true',
    });

    expect(readLegacyNotificationPreferences('user', legacy)).toEqual({
      toast_enabled: false,
      sound_enabled: false,
      violation_alerts: false,
      attendance_alerts: true,
    });
  });

  it('seeds a missing Supabase row once and clears all legacy keys only after success', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const selectExisting = vi.fn(() => ({ eq }));
    const single = vi.fn().mockResolvedValue({ data: { ...record, toast_enabled: false }, error: null });
    const selectInserted = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select: selectInserted }));
    mocks.from
      .mockReturnValueOnce({ select: selectExisting })
      .mockReturnValueOnce({ insert });
    const legacy = storage({ notif_push_user: 'false' });

    await expect(loadNotificationPreferences('user', legacy)).resolves.toMatchObject({ toast_enabled: false });
    expect(insert).toHaveBeenCalledWith({ user_id: 'user', ...DEFAULT_NOTIFICATION_PREFERENCES, toast_enabled: false });
    expect(legacy.removeItem).toHaveBeenCalledTimes(LEGACY_NOTIFICATION_PREFERENCE_KEYS.length);
  });

  it('treats an existing Supabase row as authoritative over localStorage', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: record, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    mocks.from.mockReturnValue({ select });
    const legacy = storage({ notif_push_user: 'false', notif_sound_user: 'false' });

    await expect(loadNotificationPreferences('user', legacy)).resolves.toEqual(record);
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(legacy.removeItem).toHaveBeenCalledTimes(LEGACY_NOTIFICATION_PREFERENCE_KEYS.length);
  });

  it('recovers the authoritative row when two sessions seed preferences concurrently', async () => {
    const missingSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const missingEq = vi.fn(() => ({ maybeSingle: missingSingle }));
    const missingSelect = vi.fn(() => ({ eq: missingEq }));
    const insertSingle = vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } });
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));
    const recoveredSingle = vi.fn().mockResolvedValue({ data: record, error: null });
    const recoveredEq = vi.fn(() => ({ maybeSingle: recoveredSingle }));
    const recoveredSelect = vi.fn(() => ({ eq: recoveredEq }));
    mocks.from
      .mockReturnValueOnce({ select: missingSelect })
      .mockReturnValueOnce({ insert })
      .mockReturnValueOnce({ select: recoveredSelect });

    await expect(loadNotificationPreferences('user-1')).resolves.toEqual(record);
  });
});

describe('persistent notification preferences', () => {
  it('persists the complete preference row for the authenticated owner', async () => {
    const updated = { ...record, payroll_updates: false, updated_at: '2026-08-09T12:05:00Z' };
    const single = vi.fn().mockResolvedValue({ data: updated, error: null });
    const select = vi.fn(() => ({ single }));
    const upsert = vi.fn(() => ({ select }));
    mocks.from.mockReturnValue({ upsert });

    await expect(updateNotificationPreferences('user-1', { ...DEFAULT_NOTIFICATION_PREFERENCES, payroll_updates: false })).resolves.toEqual(updated);
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', ...DEFAULT_NOTIFICATION_PREFERENCES, payroll_updates: false },
      { onConflict: 'user_id' },
    );
  });
});
