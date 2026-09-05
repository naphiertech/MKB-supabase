// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RiderTopNav } from './RiderTopNav';

vi.mock('../../hooks/useSyncQueueStatus', () => ({
  useSyncQueueStatus: () => ({
    pending: 0,
    processing: 0,
    failed: 0,
    syncing: false,
    online: true,
  }),
}));

describe('RiderTopNav', () => {
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
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.style.overflow = '';
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('renders brand header, notifications, and mobile hamburger button', () => {
    const onNavigate = vi.fn();
    const onSignOut = vi.fn();

    act(() => {
      root.render(
        <RiderTopNav
          current="dashboard"
          onNavigate={onNavigate}
          user={{
            name: 'Juan Dela Cruz',
            avatar: 'https://example.com/avatar.png',
            zoneName: 'Tetuan Sector',
          }}
          notifications={[]}
          unreadCount={0}
          onMarkAsRead={vi.fn()}
          onMarkAllAsRead={vi.fn()}
          onSignOut={onSignOut}
        />
      );
    });

    const hamburger = container.querySelector('button[aria-label="Open menu"]');
    expect(hamburger).not.toBeNull();

    // Desktop items should be rendered
    const dashboardBtn = container.querySelector('button[aria-current="page"]');
    expect(dashboardBtn?.textContent).toContain('Dashboard');

    const scheduleButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('My Schedule'));
    expect(scheduleButton).toBeDefined();
    act(() => scheduleButton?.click());
    expect(onNavigate).toHaveBeenCalledWith('schedule');

    // Click hamburger to open mobile drawer
    act(() => {
      (hamburger as HTMLButtonElement)?.click();
    });

    const closeMenuBtn = container.querySelector('button[aria-label="Close menu"]');
    expect(closeMenuBtn).not.toBeNull();

    const drawer = document.body.querySelector('[role="dialog"][aria-label="Rider navigation menu"]');
    expect(drawer).not.toBeNull();
    expect(drawer?.textContent).toContain('Juan Dela Cruz');
  });

  it('routes a schedule notification to the Rider schedule page', () => {
    const onNavigate = vi.fn();
    const onMarkAsRead = vi.fn();

    act(() => {
      root.render(
        <RiderTopNav
          current="dashboard"
          onNavigate={onNavigate}
          user={{ name: 'Juan Dela Cruz', avatar: 'https://example.com/avatar.png', zoneName: 'Tetuan Sector' }}
          notifications={[{ id: 'notification-1', type: 'system', message: 'Schedule published', time: 'just now', read: false, actionLink: '/rider/schedule' }]}
          unreadCount={1}
          onMarkAsRead={onMarkAsRead}
          onMarkAllAsRead={vi.fn()}
        />
      );
    });

    act(() => {
      (container.querySelector('button[aria-label="Notifications"]') as HTMLButtonElement)?.click();
    });
    const notification = Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent?.includes('Schedule published'));
    expect(notification).toBeDefined();
    act(() => notification?.click());

    expect(onMarkAsRead).toHaveBeenCalledWith('notification-1');
    expect(onNavigate).toHaveBeenCalledWith('schedule');
  });

  it('routes a Leave & Absence notification to the Rider leave page key', () => {
    const onNavigate = vi.fn();

    act(() => {
      root.render(
        <RiderTopNav
          current="dashboard"
          onNavigate={onNavigate}
          user={{ name: 'Juan Dela Cruz', avatar: 'https://example.com/avatar.png', zoneName: 'Tetuan Sector' }}
          notifications={[{ id: 'notification-2', type: 'system', message: 'Leave request reviewed', time: 'just now', read: false, actionLink: '/rider/leave_absence' }]}
          unreadCount={1}
          onMarkAsRead={vi.fn()}
          onMarkAllAsRead={vi.fn()}
        />,
      );
    });

    act(() => (container.querySelector('button[aria-label="Notifications"]') as HTMLButtonElement)?.click());
    const notification = Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent?.includes('Leave request reviewed'));
    expect(notification).toBeDefined();
    act(() => notification?.click());

    expect(onNavigate).toHaveBeenCalledWith('leave_absence');
  });
});
