import { describe, expect, it } from 'vitest';
import { ADMIN_ITEMS, HR_ITEMS, PAYROLL_ITEMS } from './sidebarNavigation';

function pageKeys(items: typeof ADMIN_ITEMS) {
  return items.flatMap((item) => item.type === 'link' ? [item.key] : item.items.map((child) => child.key));
}

describe('Rider Assignments navigation', () => {
  it('is available to Admin and HR but not Payroll', () => {
    expect(pageKeys(ADMIN_ITEMS)).toContain('rider_assignments');
    expect(pageKeys(HR_ITEMS)).toContain('rider_assignments');
    expect(pageKeys(PAYROLL_ITEMS)).not.toContain('rider_assignments');
  });
});
