import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), auth: { getUser: vi.fn() } },
}));

import { getCurrentParcelRateConfiguration, validateParcelRateInput, type ParcelRateConfiguration } from './parcelRateConfigurationService';

const baseInput = {
  earlyStandardRate: 12,
  regularStandardRate: 11,
  lateStandardRate: 10,
  heavyParcelRate: 17,
  heavyThresholdKg: 4,
  effectiveFrom: '2026-09-01',
  reason: 'Annual policy update',
};

describe('parcel rate configuration rules', () => {
  it('requires a future date, positive threshold, non-negative rates, and a reason', () => {
    expect(validateParcelRateInput(baseInput, '2026-08-05')).toBeNull();
    expect(validateParcelRateInput({ ...baseInput, effectiveFrom: '2026-08-05' }, '2026-08-05')).toContain('future');
    expect(validateParcelRateInput({ ...baseInput, heavyThresholdKg: 0 }, '2026-08-05')).toContain('greater than zero');
    expect(validateParcelRateInput({ ...baseInput, lateStandardRate: -1 }, '2026-08-05')).toContain('zero or greater');
    expect(validateParcelRateInput({ ...baseInput, reason: ' ' }, '2026-08-05')).toContain('reason');
  });

  it('selects only an active configuration covering the requested date', () => {
    const rows = [
      { id: 'old', active: true, effective_from: '2026-01-01', effective_until: '2026-07-31' },
      { id: 'current', active: true, effective_from: '2026-08-01', effective_until: null },
      { id: 'inactive', active: false, effective_from: '2026-08-01', effective_until: null },
    ] as ParcelRateConfiguration[];
    expect(getCurrentParcelRateConfiguration(rows, '2026-08-05')?.id).toBe('current');
  });
});
