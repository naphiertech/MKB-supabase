// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DashboardSkeleton } from '../DashboardSkeleton';
import { SkeletonTable } from '../SkeletonPrimitives';
import { UsersSkeleton } from '../../users/UsersSkeleton';
import { AttendanceSkeleton } from '../../attendance/AttendanceSkeleton';
import { AuditLogsSkeleton } from '../AuditLogsSkeleton';
import { DailyParcelEntrySkeleton, ParcelHistorySkeleton, SalaryComputationSkeleton } from '../../payroll/PayrollDashboardSkeleton';
import { RiderScheduleSkeleton, RiderLeaveAbsenceSkeleton } from '../../rider/RiderRouteSkeletons';
import type { PageKey } from '../Sidebar';

describe('MKBRidertrack Skeleton Loading Optimization Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  describe('Phase 1 & SkeletonTable Primitives', () => {
    it('defaults to 4 rows and showToolbar = false', () => {
      act(() => {
        root.render(<SkeletonTable columns={5} />);
      });

      // Rows in desktop table
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(4);

      // Default toolbar should NOT be rendered
      const toolbars = container.querySelectorAll('.ui-toolbar, [aria-label="Table loading tools"]');
      expect(toolbars.length).toBe(0);
    });

    it('honors explicit rows override and showToolbar opt-in', () => {
      act(() => {
        root.render(<SkeletonTable rows={7} columns={4} showToolbar={true} />);
      });

      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(7);

      const toolbars = container.querySelectorAll('[aria-label="Table loading tools"]');
      expect(toolbars.length).toBe(1);
    });
  });

  describe('Phase 2 & Route Skeleton Coverage in DashboardSkeleton', () => {
    const staffRoutes: PageKey[] = [
      'monitoring',
      'geofence',
      'attendance',
      'attendance_policy',
      'computation',
      'payroll',
      'payroll_adjustments',
      'daily_parcels',
      'fms_import',
      'parcel_history',
      'parcel_rates',
      'payroll_history',
      'users',
      'hubs',
      'rider_assignments',
      'rider_scheduling',
      'leave_absence',
      'reports',
      'reviews',
      'settings',
      'audit_logs',
    ];

    staffRoutes.forEach((route) => {
      it(`does NOT hit generic fallback for active route: ${route}`, () => {
        act(() => {
          root.render(<DashboardSkeleton page={route} role="admin" />);
        });

        // The generic fallback has aria-label="Loading dashboard module"
        const genericFallback = container.querySelector('[aria-label="Loading dashboard module"]');
        expect(genericFallback).toBeNull();
      });
    });

    it('specifically verifies attendance_policy renders dedicated skeleton with policy header', () => {
      act(() => {
        root.render(<DashboardSkeleton page="attendance_policy" role="admin" />);
      });
      expect(container.querySelector('[aria-label="Loading Attendance Policy"]')).not.toBeNull();
    });

    it('specifically verifies parcel_rates renders dedicated skeleton with parcel rates header', () => {
      act(() => {
        root.render(<DashboardSkeleton page="parcel_rates" role="admin" />);
      });
      expect(container.querySelector('[aria-label="Loading Parcel Rates"]')).not.toBeNull();
    });

    it('specifically verifies payroll_adjustments renders dedicated skeleton with adjustment tabs', () => {
      act(() => {
        root.render(<DashboardSkeleton page="payroll_adjustments" role="admin" />);
      });
      expect(container.querySelector('[aria-label="Loading Rider Payroll Adjustments"]')).not.toBeNull();
    });

    it('specifically verifies fms_import renders dedicated skeleton with import dropzone', () => {
      act(() => {
        root.render(<DashboardSkeleton page="fms_import" role="admin" />);
      });
      expect(container.querySelector('[aria-label="Loading Parcel Data Import"]')).not.toBeNull();
    });
  });

  describe('Phase 3 & Users Registry Skeleton', () => {
    it('renders 4 role summary chips for Admin', () => {
      act(() => {
        root.render(<UsersSkeleton role="admin" />);
      });
      const chips = container.querySelectorAll('[data-testid="users-skeleton-role-chips"] > div');
      expect(chips.length).toBe(4);
    });

    it('renders only 1 role summary chip for HR', () => {
      act(() => {
        root.render(<UsersSkeleton role="hr" />);
      });
      const chips = container.querySelectorAll('[data-testid="users-skeleton-role-chips"] > div');
      expect(chips.length).toBe(1);
    });

    it('defaults to 4 neutral rows when count is unknown', () => {
      act(() => {
        root.render(<UsersSkeleton />);
      });
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(4);
    });

    it('uses supplied trustworthy count when provided', () => {
      act(() => {
        root.render(<UsersSkeleton rows={6} />);
      });
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(6);
    });

    it('has 9 table columns matching actual Users Registry', () => {
      act(() => {
        root.render(<UsersSkeleton />);
      });
      const headers = container.querySelectorAll('thead th');
      expect(headers.length).toBe(9);
    });

    it('renders exactly one toolbar without obsolete per-page dropdown and includes filters placeholder', () => {
      act(() => {
        root.render(<UsersSkeleton />);
      });
      const toolbar = container.querySelector('[aria-label="Users filters placeholder"]');
      expect(toolbar).not.toBeNull();
      // No extra toolbar inside the table
      const allToolbars = container.querySelectorAll('[aria-label="Table loading tools"]');
      expect(allToolbars.length).toBe(0);
    });
  });

  describe('Phase 4 & Double Toolbar Protection', () => {
    it('AttendanceSkeleton has exactly one filter toolbar', () => {
      act(() => {
        root.render(<AttendanceSkeleton />);
      });
      const toolbars = container.querySelectorAll('[aria-label="Table loading tools"]');
      expect(toolbars.length).toBe(0);
      const pageToolbar = container.querySelector('[aria-label="Attendance filter placeholder"]');
      expect(pageToolbar).not.toBeNull();
    });

    it('AuditLogsSkeleton has exactly one filter toolbar', () => {
      act(() => {
        root.render(<AuditLogsSkeleton />);
      });
      const toolbars = container.querySelectorAll('[aria-label="Table loading tools"]');
      expect(toolbars.length).toBe(0);
      const pageToolbar = container.querySelector('[aria-label="Audit logs filter placeholder"]');
      expect(pageToolbar).not.toBeNull();
    });

    it('DailyParcelEntrySkeleton has exactly one filter toolbar', () => {
      act(() => {
        root.render(<DailyParcelEntrySkeleton />);
      });
      const toolbars = container.querySelectorAll('[aria-label="Table loading tools"]');
      expect(toolbars.length).toBe(0);
    });

    it('ParcelHistorySkeleton has exactly one filter toolbar', () => {
      act(() => {
        root.render(<ParcelHistorySkeleton />);
      });
      const toolbars = container.querySelectorAll('[aria-label="Table loading tools"]');
      expect(toolbars.length).toBe(0);
    });
  });

  describe('Phase 5 & Column Parity', () => {
    it('Attendance table skeleton has 7 columns', () => {
      act(() => {
        root.render(<AttendanceSkeleton />);
      });
      const headers = container.querySelectorAll('thead th');
      expect(headers.length).toBe(7);
    });

    it('Audit Logs table skeleton has 6 columns', () => {
      act(() => {
        root.render(<AuditLogsSkeleton />);
      });
      const headers = container.querySelectorAll('thead th');
      expect(headers.length).toBe(6);
    });

    it('Salary Computation skeleton has 10 columns', () => {
      act(() => {
        root.render(<SalaryComputationSkeleton />);
      });
      const headers = container.querySelectorAll('thead th');
      expect(headers.length).toBe(10);
    });
  });

  describe('Phase 6 & Daily Parcel Entry Visual Hierarchy', () => {
    it('renders header banner before filter inputs, metrics, and table', () => {
      act(() => {
        root.render(<DailyParcelEntrySkeleton />);
      });
      const content = container.querySelector('[aria-label="Loading Daily Parcel Entry"] [aria-hidden="true"]');
      expect(content).not.toBeNull();
      const children = content?.children;
      expect(children).toBeDefined();
      // Child 0: Header banner
      // Child 1: Filter toolbar (5 inputs)
      // Child 2: 3 metric cards
      // Child 3: Table card
      expect(children?.length).toBe(4);
    });
  });

  describe('Phase 9 & Rider Skeletons', () => {
    it('RiderScheduleSkeleton represents today schedule, week agenda, and upcoming entries', () => {
      act(() => {
        root.render(<RiderScheduleSkeleton />);
      });
      expect(container.querySelector('[aria-label="Loading My Schedule"]')).not.toBeNull();
      // Should have 3 main sections
      const sections = container.querySelectorAll('section');
      expect(sections.length).toBe(3);
    });

    it('RiderLeaveAbsenceSkeleton represents summary cards, header, tabs, and requests list', () => {
      act(() => {
        root.render(<RiderLeaveAbsenceSkeleton />);
      });
      expect(container.querySelector('[aria-label="Loading Leave & Absence"]')).not.toBeNull();
      const sections = container.querySelectorAll('section');
      expect(sections.length).toBe(2);
    });
  });

  describe('Phase 11 & Loading State Transitions', () => {
    function MockDataView({ loading, error, data }: { loading: boolean; error: string | null; data: string[] }) {
      if (loading) return <SkeletonTable rows={4} columns={3} />;
      if (error) return <div role="alert">{error}</div>;
      if (data.length === 0) return <div role="status">No items found</div>;
      return (
        <ul>
          {data.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    }

    it('handles transition from loading -> populated', () => {
      act(() => {
        root.render(<MockDataView loading={true} error={null} data={[]} />);
      });
      expect(container.querySelector('[data-skeleton-table]')).not.toBeNull();
      expect(container.querySelector('ul')).toBeNull();

      act(() => {
        root.render(<MockDataView loading={false} error={null} data={['Item 1', 'Item 2']} />);
      });
      expect(container.querySelector('[data-skeleton-table]')).toBeNull();
      expect(container.querySelectorAll('li').length).toBe(2);
    });

    it('handles transition from loading -> empty', () => {
      act(() => {
        root.render(<MockDataView loading={true} error={null} data={[]} />);
      });
      expect(container.querySelector('[data-skeleton-table]')).not.toBeNull();

      act(() => {
        root.render(<MockDataView loading={false} error={null} data={[]} />);
      });
      expect(container.querySelector('[data-skeleton-table]')).toBeNull();
      expect(container.textContent).toContain('No items found');
    });

    it('handles transition from loading -> error', () => {
      act(() => {
        root.render(<MockDataView loading={true} error={null} data={[]} />);
      });
      expect(container.querySelector('[data-skeleton-table]')).not.toBeNull();

      act(() => {
        root.render(<MockDataView loading={false} error="Failed to fetch records" data={[]} />);
      });
      expect(container.querySelector('[data-skeleton-table]')).toBeNull();
      expect(container.querySelector('[role="alert"]')?.textContent).toBe('Failed to fetch records');
    });
  });
});
