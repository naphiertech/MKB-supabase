// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../services/notifications/notificationPreferenceService';
import { NotificationPreferencesPanel } from './NotificationPreferencesPanel';

describe('NotificationPreferencesPanel', () => {
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

  it('shows only role-relevant persisted categories and keeps presentation controls accessible', () => {
    const onChange = vi.fn();
    act(() => root.render(
      <NotificationPreferencesPanel
        role="payroll"
        value={DEFAULT_NOTIFICATION_PREFERENCES}
        loading={false}
        error={null}
        onChange={onChange}
      />,
    ));

    expect(container.textContent).toContain('Payroll Updates');
    expect(container.textContent).toContain('Support Ticket Updates');
    expect(container.textContent).toContain('System Updates');
    expect(container.textContent).not.toContain('Violation Alerts');
    expect(container.textContent).not.toContain('Attendance Alerts');
    expect(container.textContent).toContain('Notification Center history is always preserved');

    const payrollToggle = container.querySelector<HTMLButtonElement>('button[aria-label="Payroll Updates"]');
    expect(payrollToggle?.getAttribute('role')).toBe('switch');
    expect(payrollToggle?.getAttribute('aria-checked')).toBe('true');
    act(() => payrollToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_NOTIFICATION_PREFERENCES, payroll_updates: false });
  });

  it('disables controls while loading and presents a recoverable load error', () => {
    act(() => root.render(
      <NotificationPreferencesPanel
        role="admin"
        value={DEFAULT_NOTIFICATION_PREFERENCES}
        loading
        error="Unable to load saved preferences."
        onChange={vi.fn()}
      />,
    ));
    expect(container.querySelectorAll('button[role="switch"]')).toHaveLength(7);
    expect(Array.from(container.querySelectorAll<HTMLButtonElement>('button[role="switch"]')).every((button) => button.disabled)).toBe(true);
    expect(container.textContent).toContain('Unable to load saved preferences.');
  });
});
