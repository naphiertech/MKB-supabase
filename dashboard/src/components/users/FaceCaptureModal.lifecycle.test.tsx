// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hookState = vi.hoisted(() => ({ start: vi.fn() }));

vi.mock('../../hooks/useFaceRecognition', () => ({
  useFaceRecognition: () => ({
    phase: 'scanning',
    progress: 0,
    result: null,
    start: hookState.start,
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
  }),
}));

vi.mock('../attendance/FaceScanner', () => ({ FaceScanner: () => <div>scanner</div> }));

import { FaceCaptureModal } from './FaceCaptureModal';

describe('FaceCaptureModal scan startup', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    hookState.start = vi.fn();
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
});
