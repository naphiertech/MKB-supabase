import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADMIN_ITEMS, HR_ITEMS, PAYROLL_ITEMS } from '../components/common/sidebar/sidebarNavigation';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const topbarSource = readFileSync(new URL('../components/common/Topbar.tsx', import.meta.url), 'utf8');

function sectionLabels(items: typeof ADMIN_ITEMS, title: string) {
  const section = items.find((item) => item.type === 'section' && item.title === title);
  return section?.type === 'section' ? section.items.map((item) => item.label) : [];
}

describe('Earnings & Deductions standalone UI rollback', () => {
  it('does not expose a standalone route or Topbar metadata', () => {
    expect(appSource).not.toContain("import('./pages/EarningsDeductions')");
    expect(appSource).not.toContain("safePage === 'earnings_deductions'");
    expect(topbarSource).not.toContain("earnings_deductions");
  });

  it('does not expose navigation access for Admin, HR, or Payroll', () => {
    expect(sectionLabels(ADMIN_ITEMS, 'Finance & Reports')).not.toContain('Earnings & Deductions');
    expect(sectionLabels(HR_ITEMS, 'Finance & Reports')).not.toContain('Earnings & Deductions');
    expect(sectionLabels(PAYROLL_ITEMS, 'Reference')).not.toContain('Earnings & Deductions');
  });
});
