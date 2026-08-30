// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubLocationPickerMap } from './HubLocationPickerMap';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('HubLocationPickerMap', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
  });

  it('renders unconfigured state when coordinates are null', () => {
    const onLocationChange = vi.fn();

    act(() => {
      root?.render(
        <HubLocationPickerMap
          latitude={null}
          longitude={null}
          radius={null}
          onLocationChange={onLocationChange}
        />,
      );
    });

    expect(container?.textContent).toContain('Click map to place Hub physical pin');
    expect(container?.textContent).toContain('Unconfigured');
  });

  it('renders configured pin and coordinate text when coordinates are provided', () => {
    const onLocationChange = vi.fn();

    act(() => {
      root?.render(
        <HubLocationPickerMap
          latitude={6.9254}
          longitude={122.0781}
          radius={120}
          onLocationChange={onLocationChange}
        />,
      );
    });

    expect(container?.textContent).toContain('Pin: 6.925400, 122.078100');
    expect(container?.textContent).toContain('Location Set');
  });
});
