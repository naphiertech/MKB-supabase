import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      updateUser: mocks.updateUser,
      getUser: mocks.getUser,
    },
  },
}));

import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_MIN_LENGTH_ERROR,
  validatePasswordPolicy,
  completePasswordRecovery,
} from './authSecurity';
import { updateUserAuthCredentials } from '../users/userService';
import { validate as validateForm, type FormState } from '../../components/users/userFormUtils';

describe('Authoritative Password Policy Alignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Core policy boundaries (7 vs 8 characters)', () => {
    it('defines authoritative minimum password length as 8', () => {
      expect(MIN_PASSWORD_LENGTH).toBe(8);
      expect(PASSWORD_MIN_LENGTH_ERROR).toBe('Password must be at least 8 characters.');
    });

    it('rejects 7-character passwords', () => {
      expect(() => validatePasswordPolicy('1234567')).toThrow(PASSWORD_MIN_LENGTH_ERROR);
    });

    it('rejects passwords shorter than 7 characters', () => {
      expect(() => validatePasswordPolicy('abc')).toThrow(PASSWORD_MIN_LENGTH_ERROR);
      expect(() => validatePasswordPolicy('')).toThrow(PASSWORD_MIN_LENGTH_ERROR);
    });

    it('accepts exactly 8-character passwords', () => {
      expect(() => validatePasswordPolicy('12345678')).not.toThrow();
    });

    it('accepts passwords longer than 8 characters', () => {
      expect(() => validatePasswordPolicy('correct-horse-battery-staple')).not.toThrow();
    });
  });

  describe('Authoritative backend service enforcement (updateUserAuthCredentials)', () => {
    it('rejects 7-character password at service level without invoking Supabase', async () => {
      await expect(
        updateUserAuthCredentials({
          password: 'short7c',
          fullName: 'Test User',
        }),
      ).rejects.toThrow(PASSWORD_MIN_LENGTH_ERROR);

      expect(mocks.updateUser).not.toHaveBeenCalled();
    });

    it('accepts 8-character password at service level and delegates to Supabase', async () => {
      mocks.updateUser.mockResolvedValue({
        data: {
          user: {
            id: 'u-1',
            email: 'test@mkb.ph',
            email_confirmed_at: '2026-01-01T00:00:00Z',
          },
        },
        error: null,
      });

      await expect(
        updateUserAuthCredentials({
          password: 'valid8ch',
          fullName: 'Test User',
        }),
      ).resolves.toEqual({
        currentEmail: 'test@mkb.ph',
        pendingEmail: null,
        emailVerified: true,
      });

      expect(mocks.updateUser).toHaveBeenCalledWith({
        password: 'valid8ch',
        data: { full_name: 'Test User' },
      });
    });

    it('allows updating profile without changing password when password is omitted', async () => {
      mocks.updateUser.mockResolvedValue({
        data: {
          user: {
            id: 'u-2',
            email: 'rider@mkb.ph',
            email_confirmed_at: '2026-01-01T00:00:00Z',
          },
        },
        error: null,
      });

      await expect(
        updateUserAuthCredentials({
          fullName: 'Rider Profile Update',
        }),
      ).resolves.toBeDefined();

      expect(mocks.updateUser).toHaveBeenCalledWith({
        data: { full_name: 'Rider Profile Update' },
      });
    });
  });

  describe('Authoritative recovery service enforcement (completePasswordRecovery)', () => {
    it('rejects 7-character password during recovery without invoking Supabase', async () => {
      await expect(completePasswordRecovery('short7c')).rejects.toThrow(PASSWORD_MIN_LENGTH_ERROR);
      expect(mocks.updateUser).not.toHaveBeenCalled();
    });

    it('accepts 8-character password during recovery and invokes Supabase', async () => {
      mocks.updateUser.mockResolvedValue({ error: null });
      await expect(completePasswordRecovery('valid8ch')).resolves.toBeUndefined();
      expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'valid8ch' });
    });
  });

  describe('Staff / Rider / Recovery policy parity', () => {
    it('applies the exact same 8-character rule to rider credential updates as staff', async () => {
      await expect(
        updateUserAuthCredentials({
          password: 'rider7c',
          fullName: 'Rider John',
        }),
      ).rejects.toThrow('Password must be at least 8 characters.');

      mocks.updateUser.mockResolvedValue({
        data: {
          user: {
            id: 'rider-1',
            email: 'rider.john@mkb.ph',
            email_confirmed_at: '2026-01-01T00:00:00Z',
          },
        },
        error: null,
      });

      await expect(
        updateUserAuthCredentials({
          password: 'riderPass8',
          fullName: 'Rider John',
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('Account creation stability and no strength meter additions', () => {
    const baseForm: FormState = {
      firstName: 'Maria',
      middleName: '',
      lastName: 'Santos',
      email: 'staff@mkb.ph',
      contact: '09123456789',
      tempPassword: 'pass7ch',
      role: 'hr',
      status: 'active',
      mkbRiderId: '',
      hubId: 'hub-1',
      zoneId: '',
      hubAccessScope: 'global',
      hubIds: [],
      shift: 'morning',
      faceImage: null,
      faceDescriptor: null,
      province: '',
      city: '',
      barangay: '',
      zipCode: '',
      streetAddress: '',
      emergencyContactName: 'Pedro Santos',
      emergencyContactPhone: '09123456780',
      employmentType: 'regular',
      dateOfHire: '2026-01-01',
      vehicleType: '',
      vehiclePlateNumber: '',
      notes: '',
    };

    it('validates that account creation form enforces 8-character minimum for temporary passwords', () => {
      const errors7 = validateForm({ ...baseForm, tempPassword: 'pass7ch' }, 'create');
      expect(errors7.tempPassword).toBe('Must be at least 8 characters.');

      const errors8 = validateForm({ ...baseForm, tempPassword: 'pass8char' }, 'create');
      expect(errors8.tempPassword).toBeUndefined();
    });
  });
});
