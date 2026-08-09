import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboardSource = readFileSync(new URL('./PayrollDashboard.tsx', import.meta.url), 'utf8');
const riderListSource = readFileSync(
  new URL('../components/payroll/RiderPayrollList.tsx', import.meta.url),
  'utf8',
);

function buttonContaining(label: string): string {
  const labelIndex = dashboardSource.indexOf(label);
  const buttonStart = dashboardSource.lastIndexOf('<button', labelIndex);
  const buttonEnd = dashboardSource.indexOf('</button>', labelIndex);
  return dashboardSource.slice(buttonStart, buttonEnd);
}

describe('Payroll Checklist approval navigation', () => {
  it('keeps the HR/Admin Review Approvals action inside the checklist', () => {
    const reviewButton = buttonContaining('Review Approvals');

    expect(reviewButton).toContain('handleReviewApprovals');
    expect(reviewButton).not.toContain("onNavigate?.('computation')");
  });

  it('keeps Payroll Officer computation navigation unchanged', () => {
    const computationButton = buttonContaining('Continue Computation');

    expect(computationButton).toContain("onNavigate?.('computation')");
  });

  it('requests the existing Pending Review filter and resets its pagination', () => {
    expect(dashboardSource).toContain('pendingReviewRequest={pendingReviewRequest}');
    expect(riderListSource).toContain('setStatusFilter(PayrollStatus.PENDING)');
    expect(riderListSource).toContain('setPage(1)');
  });
});
