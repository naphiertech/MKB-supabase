import { describe, expect, it } from 'vitest';
import {
  filterUsersByEmployment,
  isEmploymentActiveOnDate,
  validateArchiveInput,
} from './employmentLifecycle';

describe('employment lifecycle rules', () => {
  it('treats archive and restore dates as a non-employed gap', () => {
    const record = {
      employmentStatus: 'active' as const,
      archiveEffectiveDate: '2026-08-05',
      restoredAt: '2026-08-10T01:00:00.000Z',
    };

    expect(isEmploymentActiveOnDate(record, '2026-08-04')).toBe(true);
    expect(isEmploymentActiveOnDate(record, '2026-08-05')).toBe(false);
    expect(isEmploymentActiveOnDate(record, '2026-08-09')).toBe(false);
    expect(isEmploymentActiveOnDate(record, '2026-08-10')).toBe(true);
  });

  it('keeps an archived employee inactive from the effective date onward', () => {
    const record = {
      employmentStatus: 'archived' as const,
      archiveEffectiveDate: '2026-08-05',
      restoredAt: null,
    };

    expect(isEmploymentActiveOnDate(record, '2026-08-04')).toBe(true);
    expect(isEmploymentActiveOnDate(record, '2026-08-05')).toBe(false);
    expect(isEmploymentActiveOnDate(record, '2026-09-01')).toBe(false);
  });

  it('requires remarks for Other and rejects future effective dates', () => {
    expect(validateArchiveInput({
      reason: 'Other',
      effectiveDate: '2026-08-11',
      remarks: '',
    }, '2026-08-11')).toEqual({ remarks: 'Remarks are required when the reason is Other.' });

    expect(validateArchiveInput({
      reason: 'Resigned',
      effectiveDate: '2026-08-12',
      remarks: '',
    }, '2026-08-11')).toEqual({ effectiveDate: 'Future-dated archives are not supported yet.' });
  });

  it('defaults registry filtering to active employment while retaining explicit history', () => {
    const users = [
      { id: 'active', employmentStatus: 'active' as const },
      { id: 'archived', employmentStatus: 'archived' as const },
    ];

    expect(filterUsersByEmployment(users, 'active').map((user) => user.id)).toEqual(['active']);
    expect(filterUsersByEmployment(users, 'archived').map((user) => user.id)).toEqual(['archived']);
    expect(filterUsersByEmployment(users, 'all').map((user) => user.id)).toEqual(['active', 'archived']);
  });
});
