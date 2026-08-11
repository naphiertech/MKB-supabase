import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  storageFrom: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: { updateUser: mocks.updateUser, getUser: mocks.getUser },
    from: mocks.from,
    storage: { from: mocks.storageFrom },
  },
}));

import * as userService from './userService';

beforeEach(() => vi.clearAllMocks());

describe('legacy staff profile and email state', () => {
  it('returns the current and pending email after requesting a confirmed Auth change', async () => {
    mocks.updateUser.mockResolvedValue({
      data: {
        user: {
          id: 'staff-1',
          email: 'legacy@mkb.ph',
          new_email: 'new.staff@gmail.com',
          email_confirmed_at: '2026-01-01T00:00:00Z',
        },
      },
      error: null,
    });

    await expect(userService.updateUserAuthCredentials({
      email: 'new.staff@gmail.com',
      fullName: 'Legacy Staff',
    })).resolves.toEqual({
      currentEmail: 'legacy@mkb.ph',
      pendingEmail: 'new.staff@gmail.com',
      emailVerified: true,
    });
  });

  it('reads the confirmed Auth email as the canonical state', async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'staff-1',
          email: 'confirmed@gmail.com',
          new_email: null,
          email_confirmed_at: '2026-08-11T00:00:00Z',
        },
      },
      error: null,
    });

    const getCurrentAuthEmailState = (userService as typeof userService & {
      getCurrentAuthEmailState?: () => Promise<unknown>;
    }).getCurrentAuthEmailState;
    expect(typeof getCurrentAuthEmailState).toBe('function');
    await expect(getCurrentAuthEmailState?.()).resolves.toEqual({
      currentEmail: 'confirmed@gmail.com',
      pendingEmail: null,
      emailVerified: true,
    });
  });

  it('never writes a requested unconfirmed email into the public profile update', async () => {
    const query = { update: vi.fn(), eq: vi.fn() };
    query.update.mockReturnValue(query);
    query.eq.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue(query);

    await userService.updateUserSettingsProfile('staff-1', {
      fullName: 'Legacy Staff',
      phone: '09123456789',
    } as Parameters<typeof userService.updateUserSettingsProfile>[1]);

    expect(query.update).toHaveBeenCalledWith({
      full_name: 'Legacy Staff',
      contact: '09123456789',
    });
  });

  it('provides private staff-avatar validation without accepting arbitrary image types', () => {
    const validateStaffAvatarFile = (userService as typeof userService & {
      validateStaffAvatarFile?: (file: File) => string | null;
    }).validateStaffAvatarFile;
    expect(typeof validateStaffAvatarFile).toBe('function');
    expect(validateStaffAvatarFile?.({ type: 'image/png', size: 1024 } as File)).toBeNull();
    expect(validateStaffAvatarFile?.({ type: 'image/svg+xml', size: 1024 } as File)).toContain('JPG, PNG, or WebP');
    expect(validateStaffAvatarFile?.({ type: 'image/jpeg', size: 2 * 1024 * 1024 + 1 } as File)).toContain('2 MB');
  });

  it('uploads and replaces the same deterministic private avatar object', async () => {
    const storage = {
      upload: vi.fn().mockResolvedValue({ error: null }),
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.example/avatar' }, error: null }),
      remove: vi.fn().mockResolvedValue({ error: null }),
    };
    mocks.storageFrom.mockReturnValue(storage);

    const uploadStaffAvatar = (userService as typeof userService & {
      uploadStaffAvatar?: (userId: string, file: File) => Promise<{ path: string; signedUrl: string }>;
    }).uploadStaffAvatar;
    expect(typeof uploadStaffAvatar).toBe('function');

    const first = { type: 'image/png', size: 1024 } as File;
    const replacement = { type: 'image/webp', size: 2048 } as File;
    await uploadStaffAvatar?.('staff-1', first);
    await uploadStaffAvatar?.('staff-1', replacement);

    expect(storage.upload).toHaveBeenNthCalledWith(1, 'staff/staff-1/avatar', first, expect.objectContaining({ upsert: true }));
    expect(storage.upload).toHaveBeenNthCalledWith(2, 'staff/staff-1/avatar', replacement, expect.objectContaining({ upsert: true }));
  });

  it('removes only the deterministic avatar object', async () => {
    const storage = {
      upload: vi.fn(),
      createSignedUrl: vi.fn(),
      remove: vi.fn().mockResolvedValue({ error: null }),
    };
    mocks.storageFrom.mockReturnValue(storage);

    const removeStaffAvatar = (userService as typeof userService & {
      removeStaffAvatar?: (userId: string) => Promise<void>;
    }).removeStaffAvatar;
    expect(typeof removeStaffAvatar).toBe('function');
    await removeStaffAvatar?.('staff-1');
    expect(storage.remove).toHaveBeenCalledWith(['staff/staff-1/avatar']);
  });
});
