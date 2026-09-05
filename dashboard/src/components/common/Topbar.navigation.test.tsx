// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSearchIndexData: vi.fn(),
}));

vi.mock('../../context/HubContext', () => ({ useHub: () => ({ workspaceKey: 'all', hubs: [], selectedHubId: null, canSelectAll: true }) }));
vi.mock('../../hooks/useNetworkStatus', () => ({ useNetworkStatus: () => true }));
vi.mock('../../services/users/userService', () => ({ getSearchIndexData: mocks.getSearchIndexData }));

import { Topbar } from './Topbar';

describe('Topbar Leave & Absence navigation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.getSearchIndexData.mockResolvedValue({ users: [], zones: [] });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.querySelectorAll('[role="dialog"]').forEach((node) => node.remove());
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('resolves the staff notification link to the internal leave_absence page key', () => {
    const onNavigate = vi.fn();
    act(() => {
      root.render(
        <Topbar
          page="dashboard"
          role="hr"
          notifications={[{ id: 'notification-1', type: 'system', message: 'New leave request', time: 'just now', read: false, actionLink: '/leave_absence' }]}
          unreadCount={1}
          onMarkAsRead={vi.fn()}
          onMarkAllAsRead={vi.fn()}
          onNavigate={onNavigate}
        />,
      );
    });

    act(() => (container.querySelector('button[aria-label="Notifications"]') as HTMLButtonElement)?.click());
    const notification = Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent?.includes('New leave request'));
    expect(notification).toBeDefined();
    act(() => notification?.click());

    expect(onNavigate).toHaveBeenCalledWith('leave_absence');
  });
});
