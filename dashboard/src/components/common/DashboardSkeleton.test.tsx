// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DashboardSkeleton } from './DashboardSkeleton';

describe('DashboardSkeleton route compositions', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it.each([
    ['users', 'admin', 'Loading Users Registry'],
    ['hubs', 'admin', 'Loading Hub Management'],
    ['rider_assignments', 'hr', 'Loading Rider Assignments'],
    ['daily_parcels', 'hr', 'Loading Daily Parcel Entry'],
    ['parcel_history', 'payroll', 'Loading Parcel History'],
    ['payroll', 'admin', 'Loading Payroll Checklist'],
    ['payroll_history', 'payroll', 'Loading Payroll History'],
    ['reports', 'admin', 'Loading Insights and Reports'],
    ['reports', 'payroll', 'Loading Payroll Reports'],
  ] as const)('renders a full-width structural fallback for %s', (page, role, label) => {
    act(() => root.render(<DashboardSkeleton page={page} role={role} />));

    const status = container.querySelector<HTMLElement>(`[role="status"][aria-label="${label}"]`);
    expect(status).not.toBeNull();
    expect(status?.className).toContain('w-full');
    expect(status?.className).toContain('min-w-0');
    expect(status?.className).toContain('max-w-none');
  });

  it('matches the current Users Registry table density and footer', () => {
    act(() => root.render(<DashboardSkeleton page="users" role="admin" />));

    expect(container.querySelectorAll('[data-skeleton-table] thead th')).toHaveLength(9);
    expect(container.querySelector('[data-skeleton-table] table')?.className).toContain('data-table-wide');
    expect(container.querySelector('[data-skeleton-table] > div:last-child')).not.toBeNull();
  });

  it('uses destination-specific master-detail and responsive assignment shapes', () => {
    act(() => root.render(<DashboardSkeleton page="hubs" role="admin" />));
    expect(container.querySelectorAll('section')).toHaveLength(2);

    act(() => root.render(<DashboardSkeleton page="rider_assignments" role="admin" />));
    expect(container.querySelectorAll('[data-skeleton-table] thead th')).toHaveLength(9);
    expect(container.querySelector('[data-skeleton-table] .lg\\:hidden')).not.toBeNull();
  });

  it('dispatches rider attendance and monitoring to their own page shapes', () => {
    act(() => root.render(<DashboardSkeleton page="attendance" role="rider" />));
    expect(container.querySelector('[aria-label="Loading Rider Attendance"]')).not.toBeNull();

    act(() => root.render(<DashboardSkeleton page="monitoring" role="rider" />));
    expect(container.querySelector('[aria-label="Loading Rider Live Map"]')).not.toBeNull();
  });

  it('renders report panels instead of a generic centered loader', () => {
    act(() => root.render(<DashboardSkeleton page="reports" role="admin" />));
    expect(container.querySelector('[data-reports-panels-skeleton]')).not.toBeNull();
  });
});
