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
});
