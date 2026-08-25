import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADMIN_ITEMS, HR_ITEMS, PAYROLL_ITEMS } from '../components/common/sidebar/sidebarNavigation';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const topbarSource = readFileSync(new URL('../components/common/Topbar.tsx', import.meta.url), 'utf8');

function sectionLabels(items: typeof ADMIN_ITEMS, title: string) {
  const finance = items.find((item) => item.type === 'section' && item.title === title);
  return finance?.type === 'section' ? finance.items.map((item) => item.label) : [];
}

describe('Payroll Adjustments navigation', () => {
  it('registers one shared payroll_adjustments route and Topbar title', () => {
    expect(appSource).toContain("import('./pages/PayrollAdjustments')");
    expect(appSource).toContain("safePage === 'payroll_adjustments'");
    expect(topbarSource).toContain("payroll_adjustments:");
    expect(topbarSource).toContain("title: 'Payroll Adjustments'");
  });

  it('places Payroll Adjustments after the primary payroll action for every staff role', () => {
    for (const items of [ADMIN_ITEMS, HR_ITEMS]) {
      const labels = sectionLabels(items, 'Finance & Reports');
      expect(labels.slice(0, 3)).toEqual(['Payroll Checklist', 'Payroll Adjustments', 'Payroll History']);
    }
    expect(sectionLabels(PAYROLL_ITEMS, 'Compensation').slice(0, 3))
      .toEqual(['Salary Computation', 'Payroll Adjustments', 'Payroll Reports']);
  });
});
