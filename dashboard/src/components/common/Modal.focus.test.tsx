// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal focus lifecycle', () => {
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
    container.remove();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('keeps the same controlled input mounted and focused across multiple state updates', () => {
    let updateValue: (value: string) => void = () => undefined;
    function Harness() {
      const [value, setValue] = useState('');
      updateValue = setValue;
      return <Modal open onClose={() => undefined} title="Typing test"><input aria-label="Reason" value={value} onChange={(event) => setValue(event.target.value)} /></Modal>;
    }

    act(() => root.render(<Harness />));
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Reason"]');
    expect(input).not.toBeNull();
    input?.focus();

    act(() => updateValue('N'));
    expect(container.querySelector('input[aria-label="Reason"]')).toBe(input);
    expect(document.activeElement).toBe(input);

    act(() => updateValue('Naphier'));
    expect(input?.value).toBe('Naphier');
    expect(document.activeElement).toBe(input);
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
