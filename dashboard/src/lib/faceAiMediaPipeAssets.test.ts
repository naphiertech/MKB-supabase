// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  forVisionTasks: vi.fn(),
  createFromOptions: vi.fn(),
}));

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: mocks.forVisionTasks },
  FaceLandmarker: { createFromOptions: mocks.createFromOptions },
}));

describe('MediaPipe local asset loading', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.forVisionTasks.mockResolvedValue({ wasmLoaderPath: 'local-loader', wasmBinaryPath: 'local-wasm' });
    mocks.createFromOptions.mockResolvedValue({ close: vi.fn(), detectForVideo: vi.fn() });
  });

  it('resolves WASM and model files from application-bundled URLs only', async () => {
    const module = await import('./faceAi');
    await module.loadMediaPipeLandmarker();

    const expectedWasmBase = new URL('models/mediapipe/wasm', document.baseURI).toString().replace(/\/$/, '');
    const expectedModel = new URL('models/mediapipe/face_landmarker.task', document.baseURI).toString();
    expect(mocks.forVisionTasks).toHaveBeenCalledWith(expectedWasmBase);
    expect(mocks.createFromOptions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        baseOptions: expect.objectContaining({ modelAssetPath: expectedModel, delegate: 'GPU' }),
      }),
    );

    const configuredUrls = JSON.stringify([
      mocks.forVisionTasks.mock.calls[0]?.[0],
      mocks.createFromOptions.mock.calls[0]?.[1]?.baseOptions?.modelAssetPath,
    ]);
    expect(configuredUrls).not.toContain('cdn.jsdelivr.net');
    expect(configuredUrls).not.toContain('storage.googleapis.com/mediapipe-models');
  });

  it('surfaces local asset initialization failures without an external fallback', async () => {
    const localFailure = new Error('Local MediaPipe asset unavailable');
    mocks.forVisionTasks.mockRejectedValue(localFailure);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const module = await import('./faceAi');

    await expect(module.loadMediaPipeLandmarker()).rejects.toBe(localFailure);
    expect(mocks.forVisionTasks).toHaveBeenCalledTimes(1);
    expect(mocks.createFromOptions).not.toHaveBeenCalled();
  });
});
