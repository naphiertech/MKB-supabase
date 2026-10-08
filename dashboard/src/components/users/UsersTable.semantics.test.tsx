// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UsersTable } from './UsersTable';
import type { AppUser, Zone } from '../../services/types';

const noop = () => undefined;

describe('UsersTable status semantics', () => {
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
    document.body.innerHTML = '';
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  const baseRider: AppUser = {
    id: 'user-rider-1',
    name: 'Juan Dela Cruz',
    email: 'juan@example.com',
    avatar: '',
    role: 'rider',
    zoneId: null,
    status: 'active',
    employmentStatus: 'active',
    operationalStatus: 'active', // Should NOT be shown as Presence!
    lastLogin: 0,
  };

  const baseStaff: AppUser = {
    id: 'user-admin-1',
    name: 'Admin User',
    email: 'admin@example.com',
    avatar: '',
    role: 'admin',
    zoneId: null,
    status: 'active',
    employmentStatus: 'active',
    lastLogin: 0,
  };

  it('renders "Employed" for active employment and "Archived" for archived', () => {
    const archivedRider: AppUser = { ...baseRider, id: 'rider-archived', employmentStatus: 'archived' };
    act(() => {
      root.render(
        <UsersTable
          users={[baseRider, archivedRider]}
          zones={[]}
          onlineUserIds={[]}
          currentUserRole="admin"
        />
      );
    });

    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    // Employment is column 5 (index 4)
    expect(rows[0].querySelectorAll('td')[4].textContent?.trim()).toBe('Employed');
    expect(rows[1].querySelectorAll('td')[4].textContent?.trim()).toBe('Archived');
  });

  it('renders "Enabled" for active accounts, "Restricted" for riders, and "Suspended" for staff', () => {
    const suspendedRider: AppUser = { ...baseRider, id: 'rider-suspended', status: 'suspended' };
    const suspendedStaff: AppUser = { ...baseStaff, id: 'staff-suspended', status: 'suspended' };

    act(() => {
      root.render(
        <UsersTable
          users={[baseRider, suspendedRider, suspendedStaff]}
          zones={[]}
          onlineUserIds={[]}
          currentUserRole="admin"
        />
      );
    });

    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
    // Account is column 6 (index 5)
    expect(rows[0].querySelectorAll('td')[5].textContent?.trim()).toBe('Enabled');
    expect(rows[1].querySelectorAll('td')[5].textContent?.trim()).toBe('Restricted');
    expect(rows[2].querySelectorAll('td')[5].textContent?.trim()).toBe('Suspended');
  });

  it('renders Presence as "Online" / "Offline" strictly based on onlineUserIds for riders and "—" for staff', () => {
    const offlineRider: AppUser = { ...baseRider, id: 'rider-offline' };
    const onlineRider: AppUser = { ...baseRider, id: 'rider-online' };

    act(() => {
      root.render(
        <UsersTable
          users={[onlineRider, offlineRider, baseStaff]}
          zones={[]}
          onlineUserIds={['rider-online']}
          currentUserRole="admin"
        />
      );
    });

    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
    // Presence is column 7 (index 6)
    expect(rows[0].querySelectorAll('td')[6].textContent?.trim()).toBe('Online');
    expect(rows[1].querySelectorAll('td')[6].textContent?.trim()).toBe('Offline');
    expect(rows[2].querySelectorAll('td')[6].textContent?.trim()).toBe('—');
  });

  it('renders tailored 7-column layout for staff variant omitting Zone and Presence', () => {
    act(() => {
      root.render(
        <UsersTable
          users={[baseStaff]}
          zones={[]}
          onlineUserIds={[]}
          currentUserRole="admin"
          variant="staff"
          itemLabel="staff members"
          currentPage={1}
          totalCount={1}
          onPageChange={noop}
        />
      );
    });

    const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent?.trim());
    expect(headers).toEqual(['User', 'Role', 'Email', 'Employment', 'Account', 'Last Login', '']);

    const cells = Array.from(container.querySelectorAll('tbody tr td')).map((td) => td.textContent?.trim());
    expect(cells).toHaveLength(7);
    expect(cells[0]).toContain('Admin User');
    expect(cells[1]).toBe('Admin');
    expect(cells[2]).toBe('admin@example.com');
    expect(cells[3]).toBe('Employed');
    expect(cells[4]).toBe('Enabled');

    expect(container.textContent).toContain('1 staff members');
  });

  it('renders tailored 8-column layout for rider variant omitting Role', () => {
    act(() => {
      root.render(
        <UsersTable
          users={[baseRider]}
          zones={[{ id: 'z1', name: 'Zone Alpha', hubId: 'h1', active: true, color: '#ff0000' } as unknown as Zone]}
          onlineUserIds={['user-rider-1']}
          currentUserRole="admin"
          variant="rider"
          itemLabel="riders"
          currentPage={1}
          totalCount={1}
          onPageChange={noop}
        />
      );
    });

    const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent?.trim());
    expect(headers).toEqual(['Rider', 'Email', 'Zone', 'Employment', 'Account', 'Presence', 'Last Login', '']);

    const cells = Array.from(container.querySelectorAll('tbody tr td')).map((td) => td.textContent?.trim());
    expect(cells).toHaveLength(8);
    expect(cells[0]).toContain('Juan Dela Cruz');
    expect(cells[1]).toBe('juan@example.com');
    expect(cells[2]).toBe('—');
    expect(cells[3]).toBe('Employed');
    expect(cells[4]).toBe('Enabled');
    expect(cells[5]).toBe('Online');

    expect(container.textContent).toContain('1 riders');
  });
});
