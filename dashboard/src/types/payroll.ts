export enum PayrollStatus {
  DRAFT = 'draft',
  PENDING = 'pending', // Pending Review
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PAID = 'paid',
  FLAGGED = 'flagged'
}

export const PayrollStatusLabels: Record<PayrollStatus, string> = {
  [PayrollStatus.DRAFT]: 'Draft',
  [PayrollStatus.PENDING]: 'Pending Review',
  [PayrollStatus.APPROVED]: 'Approved',
  [PayrollStatus.REJECTED]: 'Rejected',
  [PayrollStatus.PAID]: 'Paid',
  [PayrollStatus.FLAGGED]: 'Flagged',
};

export const PayrollStatusColors: Record<PayrollStatus, string> = {
  [PayrollStatus.DRAFT]: 'bg-gray-50 text-gray-700 border-gray-200',
  [PayrollStatus.PENDING]: 'bg-amber-50 text-amber-700 border-amber-200',
  [PayrollStatus.APPROVED]: 'bg-sky-50 text-sky-700 border-sky-200',
  [PayrollStatus.REJECTED]: 'bg-rose-50 text-rose-700 border-rose-200',
  [PayrollStatus.PAID]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  [PayrollStatus.FLAGGED]: 'bg-red-50 text-red-700 border-red-200',
};

/**
 * Derives UI editability permission from status.
 * A payroll record is editable only if it is in Draft or Rejected status.
 */
export const isEditableStatus = (status: string | PayrollStatus): boolean => {
  const norm = (status || '').toLowerCase() as PayrollStatus;
  return norm === PayrollStatus.DRAFT || norm === PayrollStatus.REJECTED;
};

/**
 * Derives read-only restriction from status.
 */
export const isReadOnlyStatus = (status: string | PayrollStatus): boolean => {
  return !isEditableStatus(status);
};
