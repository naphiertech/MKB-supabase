// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateUserActionMenuPosition } from '../../lib/userActionMenuPosition';
import { UsersTable } from './UsersTable';
import type { AppUser } from '../../services/types';

const user: AppUser = {
  id: 'user-1',
  name: 'Naphier Awalie',
  email: 'naphier@example.com',
  avatar: '',
  role: 'rider',
  zoneId: null,
  status: 'active',
  employmentStatus: 'active',
  lastLogin: 0,
};

describe('employee action menu', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('opens downward when space is available and upward near the viewport bottom', () => {
    expect(calculateUserActionMenuPosition({ top: 80, bottom: 112, right: 500 }, { width: 176, height: 144 }, { width: 800, height: 700 }).placement).toBe('down');
    const bottom = calculateUserActionMenuPosition({ top: 620, bottom: 652, right: 500 }, { width: 176, height: 144 }, { width: 800, height: 700 });
    expect(bottom.placement).toBe('up');
    expect(bottom.top).toBeLessThan(620);
  });

  it('keeps all actions reachable, closes on Escape/outside click, and targets the correct employee', () => {
    act(() => root.render(<UsersTable users={[user]} zones={[]} onlineUserIds={[]} currentUserRole="hr" onViewDetails={vi.fn()} onEdit={vi.fn()} onSendPasswordReset={vi.fn()} onToggleSuspension={vi.fn()} onArchive={vi.fn()} onRestore={vi.fn()} />));
    const trigger = container.querySelector<HTMLButtonElement>('tbody tr td:last-child button');
    expect(trigger).not.toBeNull();
    act(() => trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    const menu = document.body.querySelector<HTMLElement>('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(Array.from(menu?.querySelectorAll('button') ?? []).map((button) => button.textContent?.trim())).toEqual([
      'View Profile',
      'Edit User',
      'Send Password Reset',
      'Suspend Account',
      'Archive Employee',
    ]);

    const reset = Array.from(menu?.querySelectorAll('button') ?? []).find((button) => button.textContent?.includes('Send Password Reset'));
    act(() => reset?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Naphier Awalie');

    const closeDialog = document.body.querySelector<HTMLButtonElement>('button[aria-label="Close dialog"]');
    act(() => closeDialog?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    act(() => trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    act(() => trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
    act(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });

  it('shows historical and restore actions for an archived rider without operational actions', () => {
    const archivedUser: AppUser = {
      ...user,
      status: 'suspended',
      employmentStatus: 'archived',
      archiveEffectiveDate: '2026-08-11',
      archiveReason: 'Resigned',
    };
    act(() => root.render(<UsersTable users={[archivedUser]} zones={[]} onlineUserIds={[]} currentUserRole="hr" onViewDetails={vi.fn()} onEdit={vi.fn()} onSendPasswordReset={vi.fn()} onToggleSuspension={vi.fn()} onArchive={vi.fn()} onRestore={vi.fn()} />));
    const trigger = container.querySelector<HTMLButtonElement>('tbody tr td:last-child button');
    act(() => trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const labels = Array.from(document.body.querySelectorAll('[role="menu"] button')).map((button) => button.textContent?.trim());
    expect(labels).toEqual(['View Profile', 'View History', 'Restore Employment']);
  });
});
