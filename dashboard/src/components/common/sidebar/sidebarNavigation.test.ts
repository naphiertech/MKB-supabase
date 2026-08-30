import { describe, expect, it } from 'vitest';
import { ADMIN_ITEMS, HR_ITEMS, PAYROLL_ITEMS } from './sidebarNavigation';

function pageKeys(items: typeof ADMIN_ITEMS) {
  return items.flatMap((item) => item.type === 'link' ? [item.key] : item.items.map((child) => child.key));
}

function sectionLabels(items: typeof ADMIN_ITEMS, title: string) {
  const section = items.find((item) => item.type === 'section' && item.title === title);
  return section?.type === 'section' ? section.items.map((item) => item.label) : [];
}

function findLink(items: typeof ADMIN_ITEMS, key: string) {
  const item = items.find((i) => i.type === 'link' && i.key === key);
  return item?.type === 'link' ? item : undefined;
}

describe('Rider Assignments navigation', () => {
  it('is available to Admin and HR but not Payroll', () => {
    expect(pageKeys(ADMIN_ITEMS)).toContain('rider_assignments');
    expect(pageKeys(HR_ITEMS)).toContain('rider_assignments');
    expect(pageKeys(PAYROLL_ITEMS)).not.toContain('rider_assignments');
  });
});

describe('Business configuration navigation', () => {
  it('places Attendance Policy and Parcel Rates in the Admin destination modules', () => {
    expect(sectionLabels(ADMIN_ITEMS, 'HR & Employees')).toEqual([
      'Attendance logs',
      'Users Registry',
      'Rider Assignments',
      'Attendance Policy',
      'Audit Logs',
    ]);
    expect(sectionLabels(ADMIN_ITEMS, 'Parcel Operations')).toEqual([
      'Daily Parcel Entry',
      'Parcel History',
      'Parcel Rates',
    ]);
    expect(sectionLabels(ADMIN_ITEMS, 'Finance & Reports')).toEqual([
      'Payroll Checklist',
      'Payroll Adjustments',
      'Payroll History',
      'Insights & Reports',
    ]);
    expect(findLink(ADMIN_ITEMS, 'reviews')?.label).toBe('Reviews');
  });

  it('keeps HR read-only destinations and Payroll reference access visible', () => {
    expect(sectionLabels(HR_ITEMS, 'HR & Employees')).toEqual([
      'Attendance logs',
      'Users Registry',
      'Rider Assignments',
      'Attendance Policy',
      'Audit Logs',
    ]);
    expect(sectionLabels(HR_ITEMS, 'Parcel Operations')).toEqual([
      'Daily Parcel Entry',
      'Parcel History',
      'Parcel Rates',
    ]);
    expect(sectionLabels(HR_ITEMS, 'Finance & Reports')).toEqual([
      'Payroll Checklist',
      'Payroll Adjustments',
      'Payroll History',
      'Insights & Reports',
    ]);
    expect(findLink(HR_ITEMS, 'reviews')?.label).toBe('Reviews');
    expect(sectionLabels(PAYROLL_ITEMS, 'Compensation')).toEqual([
      'Salary Computation',
      'Payroll Adjustments',
      'Payroll Reports',
      'Payroll History',
    ]);
    expect(sectionLabels(PAYROLL_ITEMS, 'Reference')).toEqual([
      'Parcel History',
      'Attendance Policy',
      'Parcel Rates',
    ]);
  });
});
