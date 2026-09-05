// @vitest-environment jsdom

import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RiderMobileDrawer } from './RiderMobileDrawer';

describe('RiderMobileDrawer', () => {
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

  it('renders rider identity and navigation links when open', () => {
    const mockOnClose = vi.fn();
    const mockOnNavigate = vi.fn();

    act(() => {
      root.render(
        <RiderMobileDrawer
          open={true}
          onClose={mockOnClose}
          current="dashboard"
          onNavigate={mockOnNavigate}
          user={{
            name: 'Juan Dela Cruz',
            avatar: 'https://example.com/avatar.png',
            zoneName: 'Tetuan Sector',
          }}
        />
      );
    });

    const dialog = document.body.querySelector('[role="dialog"][aria-label="Rider navigation menu"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Juan Dela Cruz');
    expect(dialog?.textContent).toContain('Tetuan Sector');
    expect(dialog?.textContent).toContain('Rider Portal');
    expect(dialog?.textContent).toContain('Dashboard');
    expect(dialog?.textContent).toContain('Time-In/Out');
    expect(dialog?.textContent).toContain('My Schedule');
    expect(dialog?.textContent).toContain('My Location');
    expect(dialog?.textContent).toContain('Profile');
    expect(dialog?.textContent).toContain('Sign out');

    const activeItem = dialog?.querySelector('[aria-current="page"]');
    expect(activeItem?.textContent).toContain('Dashboard');
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('triggers onNavigate and onClose when clicking a navigation link', () => {
    const mockOnClose = vi.fn();
    const mockOnNavigate = vi.fn();

    act(() => {
      root.render(
        <RiderMobileDrawer
          open={true}
          onClose={mockOnClose}
          current="dashboard"
          onNavigate={mockOnNavigate}
          user={{
            name: 'Juan Dela Cruz',
            avatar: 'https://example.com/avatar.png',
            zoneName: 'Tetuan Sector',
          }}
        />
      );
    });

    const timeInOutBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Time-In/Out')
    );
    expect(timeInOutBtn).toBeDefined();

    act(() => {
      timeInOutBtn?.click();
    });

    expect(mockOnNavigate).toHaveBeenCalledWith('attendance');
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('triggers onClose when pressing Escape key', () => {
    const mockOnClose = vi.fn();

    act(() => {
      root.render(
        <RiderMobileDrawer
          open={true}
          onClose={mockOnClose}
          current="dashboard"
          onNavigate={vi.fn()}
          user={{
            name: 'Juan Dela Cruz',
            avatar: 'https://example.com/avatar.png',
            zoneName: 'Tetuan Sector',
          }}
        />
      );
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('triggers onSignOut and onClose when clicking Sign out button', () => {
    const mockOnClose = vi.fn();
    const mockOnSignOut = vi.fn();

    act(() => {
      root.render(
        <RiderMobileDrawer
          open={true}
          onClose={mockOnClose}
          current="dashboard"
          onNavigate={vi.fn()}
          onSignOut={mockOnSignOut}
          user={{
            name: 'Juan Dela Cruz',
            avatar: 'https://example.com/avatar.png',
            zoneName: 'Tetuan Sector',
          }}
        />
      );
    });

    const signOutBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Sign out')
    );
    expect(signOutBtn).toBeDefined();

    act(() => {
      signOutBtn?.click();
    });

    expect(mockOnSignOut).toHaveBeenCalledTimes(1);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('locks body scroll when open and restores when closed or unmounted', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const btnRef = useRef<HTMLButtonElement>(null);
      return (
        <div>
          <button ref={btnRef} type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <RiderMobileDrawer
            open={open}
            onClose={() => setOpen(false)}
            current="dashboard"
            onNavigate={vi.fn()}
            triggerRef={btnRef}
            user={{
              name: 'Juan Dela Cruz',
              avatar: 'https://example.com/avatar.png',
              zoneName: 'Tetuan Sector',
            }}
          />
        </div>
      );
    }

    act(() => {
      root.render(<Harness />);
    });

    expect(document.body.style.overflow).toBe('');

    const opener = container.querySelector('button');
    act(() => {
      opener?.click();
    });

    expect(document.body.style.overflow).toBe('hidden');

    const closeBtn = document.body.querySelector('button[aria-label="Close navigation"]') as HTMLButtonElement;
    act(() => {
      closeBtn?.click();
    });

    expect(document.body.style.overflow).toBe('');
  });
});
