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
  regularHeavyRate: 16,
  lateHeavyRate: 15,
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
    expect(validateParcelRateInput({ ...baseInput, regularHeavyRate: -1 }, '2026-08-05')).toContain('zero or greater');
    expect(validateParcelRateInput({ ...baseInput, lateHeavyRate: -1 }, '2026-08-05')).toContain('zero or greater');
    expect(validateParcelRateInput({ ...baseInput, reason: ' ' }, '2026-08-05')).toContain('reason');
  });

  it('validates Small and Bulky rate progression independently', () => {
    // Valid standard progression
    expect(validateParcelRateInput(baseInput, '2026-08-05')).toBeNull();

    // Valid flat rates
    expect(validateParcelRateInput({
      ...baseInput,
      earlyStandardRate: 10,
      regularStandardRate: 10,
      lateStandardRate: 10,
      heavyParcelRate: 15,
      regularHeavyRate: 15,
      lateHeavyRate: 15,
    }, '2026-08-05')).toBeNull();

    // Valid steep drop (e.g. 15 -> 12 -> 9)
    expect(validateParcelRateInput({
      ...baseInput,
      earlyStandardRate: 15,
      regularStandardRate: 12,
      lateStandardRate: 9,
      heavyParcelRate: 20,
      regularHeavyRate: 16,
      lateHeavyRate: 12,
    }, '2026-08-05')).toBeNull();

    // Invalid Small progression: early < regular
    expect(validateParcelRateInput({
      ...baseInput,
      earlyStandardRate: 10,
      regularStandardRate: 11,
      lateStandardRate: 10,
    }, '2026-08-05')).toContain('The 8:01–9:00 AM rate cannot exceed the ≤8:00 AM rate');

    // Invalid Small progression: regular < late
    expect(validateParcelRateInput({
      ...baseInput,
      earlyStandardRate: 12,
      regularStandardRate: 10,
      lateStandardRate: 11,
    }, '2026-08-05')).toContain('The >9:00 AM rate cannot exceed the 8:01–9:00 AM rate');

    // Invalid Bulky progression: early < regular
    expect(validateParcelRateInput({
      ...baseInput,
      heavyParcelRate: 15,
      regularHeavyRate: 16,
      lateHeavyRate: 15,
    }, '2026-08-05')).toContain('The 8:01–9:00 AM bulky rate cannot exceed the ≤8:00 AM rate');

    // Invalid Bulky progression: regular < late
    expect(validateParcelRateInput({
      ...baseInput,
      heavyParcelRate: 17,
      regularHeavyRate: 14,
      lateHeavyRate: 15,
    }, '2026-08-05')).toContain('The >9:00 AM bulky rate cannot exceed the 8:01–9:00 AM rate');
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
