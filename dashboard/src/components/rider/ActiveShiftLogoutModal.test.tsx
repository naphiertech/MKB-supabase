// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ActiveShiftLogoutModal } from './ActiveShiftLogoutModal';

describe('ActiveShiftLogoutModal', () => {
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

  it('renders modal with warning message, cancel and confirm actions when open', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    act(() => {
      root.render(
        <ActiveShiftLogoutModal
          open={true}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      );
    });

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('You still have an active shift');
    expect(dialog?.textContent).toContain('You are currently timed in. Signing out will not end your attendance session.');
    expect(dialog?.textContent).toContain('Cancel');
    expect(dialog?.textContent).toContain('Sign out anyway');

    const cancelButton = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Cancel')
    );
    act(() => {
      cancelButton?.click();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);

    const confirmButton = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Sign out anyway')
    );
    act(() => {
      confirmButton?.click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not render when open is false', () => {
    act(() => {
      root.render(
        <ActiveShiftLogoutModal
          open={false}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        />
      );
    });

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});
