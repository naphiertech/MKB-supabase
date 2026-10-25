// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hookState = vi.hoisted(() => ({
  phase: 'scanning' as 'idle' | 'initializing' | 'scanning' | 'matched' | 'failed',
  livenessPrompt: 'Center your face & look straight 😐',
  start: vi.fn(),
  reset: vi.fn(),
  lastOptions: null as Record<string, unknown> | null,
}));

vi.mock('../../hooks/useFaceRecognition', () => ({
  useFaceRecognition: (options?: Record<string, unknown>) => {
    hookState.lastOptions = options ?? null;
    return {
      phase: hookState.phase,
      progress: 0,
      result: null,
      start: hookState.start,
      reset: hookState.reset,
      livenessPrompt: hookState.livenessPrompt,
      videoRef: { current: null },
      canvasRef: { current: null },
      debugInfo: {
        referenceLoaded: null,
        eyesOpen: false,
        eyesClosed: false,
        blinkCompleted: false,
        headTilted: false,
        currentEAR: 0,
        headTiltAngle: 0,
        lastDistance: null,
      },
    };
  },
}));

const scannerPropsSpy = vi.hoisted(() => vi.fn());
vi.mock('../attendance/FaceScanner', () => ({
  FaceScanner: (props: Record<string, unknown>) => {
    scannerPropsSpy(props);
    return <div>scanner</div>;
  },
}));

import { FaceCaptureModal } from './FaceCaptureModal';

describe('FaceCaptureModal scan startup', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    hookState.phase = 'scanning';
    hookState.livenessPrompt = 'Center your face & look straight 😐';
    hookState.start = vi.fn();
    hookState.reset = vi.fn();
    hookState.lastOptions = null;
    scannerPropsSpy.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('starts enrollment once even if the hook exposes a new callback after diagnostic rerenders', () => {
    const props = {
      riderName: 'Test Rider',
      seedAvatar: 'avatar.jpg',
      onCapture: vi.fn(),
      onCancel: vi.fn(),
    };

    act(() => root.render(<FaceCaptureModal {...props} />));
    const initialStart = hookState.start;
    expect(initialStart).toHaveBeenCalledTimes(1);

    const replacementStart = vi.fn();
    hookState.start = replacementStart;
    act(() => root.render(<FaceCaptureModal {...props} riderName="Updated Rider" />));

    expect(initialStart).toHaveBeenCalledTimes(1);
    expect(replacementStart).not.toHaveBeenCalled();
  });

  it('configures a 15-second enrollment window, passes livenessPrompt to FaceScanner, and allows retrying on failure', () => {
    hookState.phase = 'failed';
    const props = {
      riderName: 'Test Rider',
      seedAvatar: 'avatar.jpg',
      onCapture: vi.fn(),
      onCancel: vi.fn(),
    };

    act(() => root.render(<FaceCaptureModal {...props} />));

    expect(hookState.lastOptions?.durationMs).toBe(15000);
    expect(scannerPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ livenessPrompt: 'Center your face & look straight 😐' }),
    );

    const retryButton = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('Retry scan'),
    );
    expect(retryButton).toBeDefined();

    act(() => {
      retryButton?.click();
    });
    expect(hookState.reset).toHaveBeenCalledTimes(1);
    expect(hookState.start).toHaveBeenCalledTimes(2);
  });
});
