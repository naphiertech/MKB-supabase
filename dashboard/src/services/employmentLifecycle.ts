import type { EmploymentStatus } from './types';

export const ARCHIVE_REASONS = ['Resigned', 'Terminated', 'Contract Ended', 'Retired', 'Other'] as const;
export type ArchiveReason = (typeof ARCHIVE_REASONS)[number];
export type EmploymentFilter = EmploymentStatus | 'all';

export interface EmploymentDateRecord {
  employmentStatus: EmploymentStatus;
  archiveEffectiveDate?: string | null;
  restoredAt?: string | null;
}

export interface ArchiveInput {
  reason: ArchiveReason | '';
  effectiveDate: string;
  remarks?: string | null;
}

export type ArchiveInputErrors = Partial<Record<'reason' | 'effectiveDate' | 'remarks', string>>;

function businessDateFromTimestamp(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
}

export function isEmploymentActiveOnDate(record: EmploymentDateRecord, targetDate: string): boolean {
  const archiveDate = record.archiveEffectiveDate || null;
  if (!archiveDate) return record.employmentStatus === 'active';
  if (targetDate < archiveDate) return true;
  if (record.employmentStatus === 'archived') return false;

  const restoredDate = record.restoredAt ? businessDateFromTimestamp(record.restoredAt) : null;
  return Boolean(restoredDate && targetDate >= restoredDate);
}

export function validateArchiveInput(input: ArchiveInput, today: string): ArchiveInputErrors {
  if (!input.reason) return { reason: 'Select an archive reason.' };
  if (!input.effectiveDate) return { effectiveDate: 'Select an effective date.' };
  if (input.effectiveDate > today) return { effectiveDate: 'Future-dated archives are not supported yet.' };
  if (input.reason === 'Other' && !input.remarks?.trim()) {
    return { remarks: 'Remarks are required when the reason is Other.' };
  }
  return {};
}

export function filterUsersByEmployment<T extends { employmentStatus: EmploymentStatus }>(
  users: T[],
  filter: EmploymentFilter,
): T[] {
  return filter === 'all' ? users : users.filter((user) => user.employmentStatus === filter);
}
