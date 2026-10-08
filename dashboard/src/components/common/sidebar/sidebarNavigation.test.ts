import { describe, expect, it } from 'vitest';
import { ADMIN_ITEMS, HR_ITEMS, PAYROLL_ITEMS, FMS_IMPORT_NAV_ICON, type SidebarItem, type PageKey } from './sidebarNavigation';

function allPageKeys(items: SidebarItem[]): PageKey[] {
  return items.flatMap((item) => (item.type === 'link' ? [item.key] : item.items.map((child) => child.key)));
}

function allLabels(items: SidebarItem[]): string[] {
  return items.flatMap((item) =>
    item.type === 'link' ? [item.label] : [item.title, ...item.items.map((child) => child.label)]
  );
}

function sectionChildrenLabels(items: SidebarItem[], title: string): string[] {
  const section = items.find((item) => item.type === 'section' && item.title === title);
  return section?.type === 'section' ? section.items.map((item) => item.label) : [];
}

function findLink(items: SidebarItem[], key: string) {
  const item = items.find((i) => i.type === 'link' && i.key === key);
  return item?.type === 'link' ? item : undefined;
}

describe('MKBRiderTrack Role-Specific Sidebar Navigation', () => {
  describe('Admin Sidebar', () => {
    it('contains approved Admin section and item labels in correct visual order', () => {
      // 1. Dashboard root link
      expect(findLink(ADMIN_ITEMS, 'dashboard')?.label).toBe('Dashboard');

      // 2. Fleet & Operations section
      expect(sectionChildrenLabels(ADMIN_ITEMS, 'Fleet & Operations')).toEqual([
        'Live Monitoring',
        'Geofence & Zones',
        'Hub Management',
      ]);

      // 3. Workforce & Users section
      expect(sectionChildrenLabels(ADMIN_ITEMS, 'Workforce & Users')).toEqual([
        'Attendance Logs',
        'User & Staff Directory',
        'Rider Assignments',
        'Leave & Absence',
        'Attendance Policy',
      ]);

      // 4. Parcel Operations section
      expect(sectionChildrenLabels(ADMIN_ITEMS, 'Parcel Operations')).toEqual([
        'Parcel Data Import',
        'Daily Parcel Entry',
        'Parcel History',
        'Parcel Rate Settings',
      ]);

      // 5. Payroll & Approvals section
      expect(sectionChildrenLabels(ADMIN_ITEMS, 'Payroll & Approvals')).toEqual([
        'Payroll Approvals',
        'Payroll Adjustments',
        'Payroll History',
      ]);

      // 6. Analytics & Reports section
      expect(sectionChildrenLabels(ADMIN_ITEMS, 'Analytics & Reports')).toEqual([
        'Workforce Analytics',
      ]);

      // 7. Root links: Review Moderation and System Audit Logs
      expect(findLink(ADMIN_ITEMS, 'reviews')?.label).toBe('Review Moderation');
      expect(findLink(ADMIN_ITEMS, 'audit_logs')?.label).toBe('System Audit Logs');
    });

    it('does NOT expose old replaced labels in Admin', () => {
      const labels = allLabels(ADMIN_ITEMS);
      expect(labels).not.toContain('Tracking & Zones');
      expect(labels).not.toContain('HR & Employees');
      expect(labels).not.toContain('Users Registry');
      expect(labels).not.toContain('Finance & Reports');
      expect(labels).not.toContain('Insights & Reports');
      expect(labels).not.toContain('Reviews');
      expect(labels).not.toContain('Payroll Checklist');
      expect(labels).not.toContain('Attendance logs');
      expect(labels).not.toContain('Geofence / Zones');
    });
  });

  describe('HR Sidebar', () => {
    it('contains approved HR section and item labels in correct visual order', () => {
      // 1. Dashboard root link
      expect(findLink(HR_ITEMS, 'dashboard')?.label).toBe('Dashboard');

      // 2. Live Fleet Tracking section
      expect(sectionChildrenLabels(HR_ITEMS, 'Live Fleet Tracking')).toEqual([
        'Live Monitoring',
      ]);

      // 3. Workforce & Attendance section
      expect(sectionChildrenLabels(HR_ITEMS, 'Workforce & Attendance')).toEqual([
        'Attendance Logs',
        'Rider Registry',
        'Rider Assignments',
        'Leave & Absence',
        'Attendance Policy (Reference)',
      ]);

      // 4. Parcel Operations section
      expect(sectionChildrenLabels(HR_ITEMS, 'Parcel Operations')).toEqual([
        'Parcel Data Import',
        'Daily Parcel Entry',
        'Parcel History',
        'Parcel Rates (Reference)',
      ]);

      // 5. Payroll Verification section
      expect(sectionChildrenLabels(HR_ITEMS, 'Payroll Verification')).toEqual([
        'Payroll Approvals',
        'Payroll Adjustments (View)',
        'Payroll History',
      ]);

      // 6. Root links: Workforce Analytics, Customer Feedback, System Audit Logs
      expect(findLink(HR_ITEMS, 'reports')?.label).toBe('Workforce Analytics');
      expect(findLink(HR_ITEMS, 'reviews')?.label).toBe('Customer Feedback');
      expect(findLink(HR_ITEMS, 'audit_logs')?.label).toBe('System Audit Logs');
    });

    it('does NOT expose old replaced labels in HR', () => {
      const labels = allLabels(HR_ITEMS);
      expect(labels).not.toContain('Tracking & Zones');
      expect(labels).not.toContain('HR & Employees');
      expect(labels).not.toContain('Users Registry');
      expect(labels).not.toContain('Finance & Reports');
      expect(labels).not.toContain('Insights & Reports');
      expect(labels).not.toContain('Reviews');
      expect(labels).not.toContain('Payroll Checklist');
      expect(labels).not.toContain('Attendance logs');
    });
  });

  describe('Payroll Sidebar', () => {
    it('keeps existing specialized Payroll labels and sections intact', () => {
      expect(findLink(PAYROLL_ITEMS, 'dashboard')?.label).toBe('Dashboard');

      expect(sectionChildrenLabels(PAYROLL_ITEMS, 'Compensation')).toEqual([
        'Salary Computation',
        'Payroll Adjustments',
        'Payroll Reports',
        'Payroll History',
      ]);

      expect(sectionChildrenLabels(PAYROLL_ITEMS, 'Reference')).toEqual([
        'Parcel History',
        'Attendance Policy',
        'Parcel Rates',
      ]);
    });
  });

  describe('Route Key & Authorization Integrity', () => {
    it('preserves PageKeys for Admin', () => {
      const keys = allPageKeys(ADMIN_ITEMS);
      expect(keys).toContain('dashboard');
      expect(keys).toContain('monitoring');
      expect(keys).toContain('geofence');
      expect(keys).toContain('hubs');
      expect(keys).toContain('attendance');
      expect(keys).toContain('users');
      expect(keys).toContain('rider_assignments');
      expect(keys).toContain('leave_absence');
      expect(keys).toContain('attendance_policy');
      expect(keys).toContain('daily_parcels');
      expect(keys).toContain('parcel_history');
      expect(keys).toContain('parcel_rates');
      expect(keys).toContain('payroll');
      expect(keys).toContain('payroll_adjustments');
      expect(keys).toContain('payroll_history');
      expect(keys).toContain('reports');
      expect(keys).toContain('reviews');
      expect(keys).toContain('audit_logs');
      expect(keys).toContain('fms_import');
    });

    it('preserves PageKeys for HR while keeping geofence and hubs excluded', () => {
      const keys = allPageKeys(HR_ITEMS);
      expect(keys).toContain('dashboard');
      expect(keys).toContain('monitoring');
      expect(keys).toContain('attendance');
      expect(keys).toContain('users');
      expect(keys).toContain('rider_assignments');
      expect(keys).toContain('leave_absence');
      expect(keys).toContain('attendance_policy');
      expect(keys).toContain('daily_parcels');
      expect(keys).toContain('parcel_history');
      expect(keys).toContain('parcel_rates');
      expect(keys).toContain('payroll');
      expect(keys).toContain('payroll_adjustments');
      expect(keys).toContain('payroll_history');
      expect(keys).toContain('reports');
      expect(keys).toContain('reviews');
      expect(keys).toContain('audit_logs');
      expect(keys).toContain('fms_import');

      // Crucial RBAC preservation: HR cannot see or access geofence, hubs, or computation
      expect(keys).not.toContain('geofence');
      expect(keys).not.toContain('hubs');
      expect(keys).not.toContain('computation');
    });

    it('preserves PageKeys for Payroll', () => {
      const keys = allPageKeys(PAYROLL_ITEMS);
      expect(keys).toEqual([
        'dashboard',
        'computation',
        'payroll_adjustments',
        'reports',
        'payroll_history',
        'parcel_history',
        'attendance_policy',
        'parcel_rates',
      ]);
      expect(keys).not.toContain('monitoring');
      expect(keys).not.toContain('geofence');
      expect(keys).not.toContain('hubs');
      expect(keys).not.toContain('attendance');
      expect(keys).not.toContain('users');
      expect(keys).not.toContain('rider_assignments');
      expect(keys).not.toContain('leave_absence');
      expect(keys).not.toContain('reviews');
      expect(keys).not.toContain('audit_logs');
      expect(keys).not.toContain('fms_import');
    });
  });

  describe('Parcel Data Import Navigation Entry', () => {
    it('exposes fms_import with "Parcel Data Import" label in Admin and HR visible navigation items', () => {
      expect(allPageKeys(ADMIN_ITEMS)).toContain('fms_import');
      expect(allPageKeys(HR_ITEMS)).toContain('fms_import');
      expect(allPageKeys(PAYROLL_ITEMS)).not.toContain('fms_import');

      expect(allLabels(ADMIN_ITEMS)).toContain('Parcel Data Import');
      expect(allLabels(HR_ITEMS)).toContain('Parcel Data Import');
      expect(allLabels(PAYROLL_ITEMS)).not.toContain('Parcel Data Import');
    });

    it('places Parcel Data Import under Parcel Operations in Admin with FMS_IMPORT_NAV_ICON', () => {
      const parcelSection = ADMIN_ITEMS.find((item) => item.type === 'section' && item.title === 'Parcel Operations');
      expect(parcelSection?.type).toBe('section');
      if (parcelSection?.type === 'section') {
        const fmsItem = parcelSection.items.find((item) => item.key === 'fms_import');
        expect(fmsItem).toBeDefined();
        expect(fmsItem?.label).toBe('Parcel Data Import');
        expect(fmsItem?.icon).toBe(FMS_IMPORT_NAV_ICON);
      }
    });

    it('places Parcel Data Import under Parcel Operations in HR with FMS_IMPORT_NAV_ICON', () => {
      const parcelSection = HR_ITEMS.find((item) => item.type === 'section' && item.title === 'Parcel Operations');
      expect(parcelSection?.type).toBe('section');
      if (parcelSection?.type === 'section') {
        const fmsItem = parcelSection.items.find((item) => item.key === 'fms_import');
        expect(fmsItem).toBeDefined();
        expect(fmsItem?.label).toBe('Parcel Data Import');
        expect(fmsItem?.icon).toBe(FMS_IMPORT_NAV_ICON);
      }
    });
  });
});
