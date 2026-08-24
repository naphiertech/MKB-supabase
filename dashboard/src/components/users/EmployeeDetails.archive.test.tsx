// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppUser } from '../../services/types';
import { EmployeeDetails } from './EmployeeDetails';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ session: { id: 'admin-1', role: 'admin' } }) }));
vi.mock('../../hooks/useToast', () => ({ pushToast: vi.fn() }));
vi.mock('../../services/riders/riderService', () => ({ getUserTrustedDevice: vi.fn(), resetUserTrustedDevice: vi.fn() }));
vi.mock('../../lib/exports/employeeExport', () => ({ exportEmployeeProfileCard: vi.fn(), exportEmployeeDTR: vi.fn() }));

const archivedEmployee: AppUser = {
  id: 'payroll-1',
  name: 'Former Payroll Officer',
  email: 'former@example.test',
  avatar: '',
  role: 'payroll',
  zoneId: null,
  status: 'suspended',
  employmentStatus: 'archived',
  archiveEffectiveDate: '2026-08-10',
  archiveReason: 'Resigned',
  archiveRemarks: 'Clearance complete.',
  archivedAt: '2026-08-10T09:00:00+08:00',
  archivedByName: 'Admin One',
  lastLogin: 0,
};

describe('archived employee profile', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('shows lifecycle metadata and preserves profile access without operational editing', () => {
    act(() => root.render(<EmployeeDetails user={archivedEmployee} zones={[]} onClose={vi.fn()} onEdit={vi.fn()} />));
    expect(container.textContent).toContain('Archived');
    expect(container.textContent).toContain('2026-08-10');
    expect(container.textContent).toContain('Resigned');
    expect(container.textContent).toContain('Clearance complete.');
    expect(container.textContent).toContain('Admin One');
    expect(container.textContent).toContain('Employment Details');
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent?.includes('Edit Profile'))).toBe(false);
  });
});
