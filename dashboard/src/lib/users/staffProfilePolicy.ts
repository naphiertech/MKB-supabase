import type { UserRole } from '../../services/types';

export const STAFF_ALLOWED_EMAIL_DOMAINS = ['gmail.com'] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isStaffRole(role: UserRole): boolean {
  return role === 'admin' || role === 'hr' || role === 'payroll';
}

export function validateStaffEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return 'Email is required.';
  if (!EMAIL_PATTERN.test(normalized)) return 'Invalid email format.';
  const domain = normalized.split('@')[1];
  if (!STAFF_ALLOWED_EMAIL_DOMAINS.includes(domain as (typeof STAFF_ALLOWED_EMAIL_DOMAINS)[number])) {
    return `Staff email must use an approved domain (${STAFF_ALLOWED_EMAIL_DOMAINS.join(', ')}).`;
  }
  return null;
}

export function isSameEmail(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left || '').trim().toLowerCase() === (right || '').trim().toLowerCase();
}

export interface StaffProfileCompletenessInput {
  contact?: string | null;
  employmentType?: string | null;
  dateOfHire?: string | null;
}

export function getMissingStaffProfileFields(profile: StaffProfileCompletenessInput): string[] {
  const missing: string[] = [];
  if (!profile.contact?.trim()) missing.push('Contact number');
  if (!profile.employmentType?.trim()) missing.push('Employment type');
  if (!profile.dateOfHire?.trim()) missing.push('Hire / start date');
  return missing;
}
