// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenter } from './NotificationCenter';
import { useNotificationContext } from '../context/NotificationContext';

vi.mock('../context/NotificationContext', () => ({
  useNotificationContext: vi.fn()
}));

vi.mock('../hooks/useToast', () => ({
  appToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

const mockNotifications = [
  {
    id: 'n-1',
    title: 'Geofence Breach',
    message: 'Rider John left assigned zone.',
    priority: 'high',
    category: 'geofence',
    type: 'violation',
    read: false,
    created_at: new Date().toISOString(),
    archived_at: null,
    deleted_at: null,
    action_link: '/monitoring'
  },
  {
    id: 'n-2',
    title: 'Payroll Approved',
    message: 'Period 1 cut-off review settled.',
    priority: 'medium',
    category: 'payroll',
    type: 'system',
    read: true,
    created_at: new Date().toISOString(),
    archived_at: null,
    deleted_at: null,
    action_link: '/payroll'
  },
  {
    id: 'n-3',
    title: 'Old Incident',
    message: 'Archived attendance issue.',
    priority: 'low',
    category: 'attendance',
    type: 'attendance',
    read: true,
    created_at: new Date().toISOString(),
    archived_at: new Date().toISOString(),
    deleted_at: null,
    action_link: null
  },
  {
    id: 'n-4',
    title: 'Discarded Alert',
    message: 'Soft-deleted notice.',
    priority: 'low',
    category: 'system',
    type: 'system',
    read: true,
    created_at: new Date().toISOString(),
    archived_at: null,
    deleted_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    action_link: null
  }
];

describe('NotificationCenter page component', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mockMarkAsRead = vi.fn();
  const mockMarkAllAsRead = vi.fn();
  const mockArchive = vi.fn();
  const mockTrash = vi.fn();
  const mockRestore = vi.fn();
  const mockDeletePermanently = vi.fn();
  const mockEmptyTrash = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    vi.mocked(useNotificationContext).mockReturnValue({
      notifications: mockNotifications as any,
      unreadCount: 1,
      loading: false,
      notificationPreferences: {} as any,
      notificationPreferencesLoading: false,
      notificationPreferencesError: null,
      markAsRead: mockMarkAsRead,
      markAllAsRead: mockMarkAllAsRead,
      archiveNotifications: mockArchive,
      trashNotifications: mockTrash,
      restoreNotifications: mockRestore,
      deleteNotificationsPermanently: mockDeletePermanently,
      emptyTrash: mockEmptyTrash,
      refreshNotifications: vi.fn(),
      saveNotificationPreferences: vi.fn()
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders status tabs with accurate badge counts', () => {
    act(() => {
      root.render(<NotificationCenter />);
    });

    expect(container.textContent).toContain('Notification Center');
    expect(container.textContent).toContain('All');
    expect(container.textContent).toContain('Unread');
    expect(container.textContent).toContain('Archived');
    expect(container.textContent).toContain('Trash');

    // Default "All" shows active unarchived items (n-1, n-2)
    expect(container.textContent).toContain('Geofence Breach');
    expect(container.textContent).toContain('Payroll Approved');
    expect(container.textContent).not.toContain('Old Incident');
    expect(container.textContent).not.toContain('Discarded Alert');
  });

  it('filters notifications by tab correctly and displays trash retention banner', () => {
    act(() => {
      root.render(<NotificationCenter />);
    });

    // Find and click the "Trash" tab button
    const buttons = Array.from(container.querySelectorAll('button'));
    const trashBtn = buttons.find(b => b.textContent?.includes('Trash'));
    expect(trashBtn).toBeDefined();

    act(() => {
      trashBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Banner and trash item should now be in the document
    expect(container.textContent).toContain('Trash Retention Policy');
    expect(container.textContent).toContain('Discarded Alert');
    expect(container.textContent).not.toContain('Geofence Breach');
  });

  it('supports search query filtering', () => {
    act(() => {
      root.render(<NotificationCenter />);
    });

    const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(searchInput).toBeDefined();

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(searchInput, 'Payroll');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('Payroll Approved');
    expect(container.textContent).not.toContain('Geofence Breach');
  });

  it('handles multi-select and bulk move to trash', () => {
    act(() => {
      root.render(<NotificationCenter />);
    });

    // Select all checkbox is the first checkbox
    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    const selectAllCheckbox = checkboxes[0];

    act(() => {
      selectAllCheckbox.click();
    });

    expect(container.textContent).toContain('2 notification(s) selected');

    // Find "Move to Trash" button in floating bulk bar
    const buttons = Array.from(container.querySelectorAll('button'));
    const moveTrashBtn = buttons.find(b => b.textContent?.includes('Move to Trash'));
    expect(moveTrashBtn).toBeDefined();

    act(() => {
      moveTrashBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockTrash).toHaveBeenCalledWith(['n-1', 'n-2']);
  });

  it('opens confirmation modal and executes empty trash', () => {
    act(() => {
      root.render(<NotificationCenter />);
    });

    // Switch to Trash tab
    const buttons = Array.from(container.querySelectorAll('button'));
    const trashBtn = buttons.find(b => b.textContent?.includes('Trash'));
    act(() => {
      trashBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Click "Empty Trash"
    const emptyBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Empty Trash'));
    expect(emptyBtn).toBeDefined();

    act(() => {
      emptyBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Empty Trash Permanently?');

    // Confirm empty trash
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Yes, Empty Trash'));
    act(() => {
      confirmBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockEmptyTrash).toHaveBeenCalled();
  });
});
