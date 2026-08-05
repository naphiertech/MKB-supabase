import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() }, auth: { getUser: vi.fn() } },
}));

import {
  getRiderDocumentDisplayStatus,
  MAX_RIDER_DOCUMENT_BYTES,
  validateRiderDocumentFile,
} from './riderDocumentService';

describe('rider document presentation rules', () => {
  const now = new Date('2026-08-05T12:00:00');

  it('distinguishes missing, pending, verified, expiring, and expired documents', () => {
    expect(getRiderDocumentDisplayStatus(null, now)).toBe('missing');
    expect(getRiderDocumentDisplayStatus({ verification_status: 'pending', expiration_date: null }, now)).toBe('pending');
    expect(getRiderDocumentDisplayStatus({ verification_status: 'verified', expiration_date: '2027-01-01' }, now)).toBe('verified');
    expect(getRiderDocumentDisplayStatus({ verification_status: 'verified', expiration_date: '2026-09-04' }, now)).toBe('expiring_soon');
    expect(getRiderDocumentDisplayStatus({ verification_status: 'verified', expiration_date: '2026-08-04' }, now)).toBe('expired');
  });

  it('enforces the deployed MIME and 5 MB limits before upload', () => {
    expect(validateRiderDocumentFile({ type: 'application/pdf', size: MAX_RIDER_DOCUMENT_BYTES } as File)).toBeNull();
    expect(validateRiderDocumentFile({ type: 'text/plain', size: 100 } as File)).toContain('PDF');
    expect(validateRiderDocumentFile({ type: 'image/png', size: MAX_RIDER_DOCUMENT_BYTES + 1 } as File)).toContain('5 MB');
  });
});
