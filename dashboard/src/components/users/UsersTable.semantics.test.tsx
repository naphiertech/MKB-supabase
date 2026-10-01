// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UsersTable } from './UsersTable';
import type { AppUser } from '../../services/types';

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
});
