// @vitest-environment jsdom

import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RightDrawer } from './RightDrawer';

describe('RightDrawer interaction lifecycle', () => {
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

  it('portals to the body, locks scrolling, dismisses on Escape, and restores focus', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const inputRef = useRef<HTMLInputElement>(null);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open drawer</button>
          <RightDrawer
            open={open}
            onClose={() => setOpen(false)}
            ariaLabel="Test drawer"
            initialFocusRef={inputRef}
          >
            <input ref={inputRef} aria-label="Drawer input" />
            <button type="button" onClick={() => setOpen(false)}>Cancel</button>
          </RightDrawer>
        </>
      );
    }

    act(() => root.render(<Harness />));
    const opener = container.querySelector<HTMLButtonElement>('button');
    opener?.focus();
    act(() => opener?.click());

    const dialog = document.body.querySelector('[role="dialog"][aria-modal="true"]');
    const input = document.body.querySelector<HTMLInputElement>('input[aria-label="Drawer input"]');
    expect(dialog).not.toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement).toBe(input);

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(opener);

    act(() => opener?.click());
    const backdrop = document.body.querySelectorAll<HTMLButtonElement>('button[aria-label="Close drawer"]')[0];
    act(() => backdrop?.click());
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(opener);
  });
});
