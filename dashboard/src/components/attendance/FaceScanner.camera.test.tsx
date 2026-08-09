// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FaceScanner } from './FaceScanner';

describe('FaceScanner camera lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root | null;
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  const getUserMedia = vi.fn().mockResolvedValue(stream);

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    stop.mockClear();
    getUserMedia.mockClear();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  function render(phase: 'initializing' | 'scanning' | 'matched' | 'failed') {
    root?.render(
      <FaceScanner
        phase={phase}
        progress={0}
        riderName="Test Rider"
        riderAvatar="avatar.jpg"
      />,
    );
  }

  it('requests and attaches one stream across scanner phase changes, then stops it on unmount', async () => {
    await act(async () => {
      render('initializing');
      await Promise.resolve();
    });

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(video?.srcObject).toBe(stream);

    await act(async () => {
      render('scanning');
      render('matched');
      render('failed');
      await Promise.resolve();
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();

    act(() => root?.unmount());
    root = null;
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
