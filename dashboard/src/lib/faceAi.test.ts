// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

function createDetectionChain() {
  const descriptorTask = Promise.resolve(undefined);
  const landmarkTask = Object.assign(Promise.resolve(undefined), {
    withFaceDescriptor: vi.fn(() => descriptorTask),
  });
  return Object.assign(Promise.resolve(undefined), {
    withFaceLandmarks: vi.fn(() => landmarkTask),
  });
}

function installFaceApi() {
  const loadSsd = vi.fn().mockResolvedValue(undefined);
  const loadLandmarks = vi.fn().mockResolvedValue(undefined);
  const loadRecognition = vi.fn().mockResolvedValue(undefined);
  const detectSingleFace = vi.fn(() => createDetectionChain());
  const detectFaceLandmarks = vi.fn().mockResolvedValue([]);
  const computeFaceDescriptor = vi.fn().mockResolvedValue(new Float32Array(128));

  Object.assign(window, {
    faceapi: {
      nets: {
        ssdMobilenetv1: { loadFromUri: loadSsd },
        faceLandmark68Net: { loadFromUri: loadLandmarks },
        faceRecognitionNet: { loadFromUri: loadRecognition },
      },
      SsdMobilenetv1Options: class {},
      detectSingleFace,
      detectFaceLandmarks,
      computeFaceDescriptor,
      euclideanDistance: vi.fn(() => 0.2),
    },
  });

  return {
    loadSsd,
    loadLandmarks,
    loadRecognition,
    detectSingleFace,
    detectFaceLandmarks,
    computeFaceDescriptor,
  };
}

describe('biometric model lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    } as unknown as CanvasRenderingContext2D);
  });

  it('warms SSD, landmarks, recognition, and MediaPipe without retaining a descriptor', async () => {
    const faceApi = installFaceApi();
    const landmarker = { detectForVideo: vi.fn(() => ({ faceLandmarks: [] })) };
    const module = await import('./faceAi');

    await module.warmUpModels(landmarker as never);

    expect(faceApi.detectSingleFace).toHaveBeenCalledTimes(1);
    expect(faceApi.detectFaceLandmarks).toHaveBeenCalledTimes(1);
    expect(faceApi.computeFaceDescriptor).toHaveBeenCalledTimes(1);
    expect(landmarker.detectForVideo).toHaveBeenCalledTimes(1);
  });

  it('keeps resident face-api weights loaded across transient release and reuse', async () => {
    const faceApi = installFaceApi();
    const module = await import('./faceAi');

    await module.loadFaceModels();
    await module.releaseBiometrics();
    await module.loadFaceModels();

    expect(faceApi.loadSsd).toHaveBeenCalledTimes(1);
    expect(faceApi.loadLandmarks).toHaveBeenCalledTimes(1);
    expect(faceApi.loadRecognition).toHaveBeenCalledTimes(1);
  });

  it('keeps the production descriptor invariants explicit', async () => {
    installFaceApi();
    const module = await import('./faceAi') as typeof import('./faceAi') & Record<string, unknown>;

    expect(module.FACE_MATCH_THRESHOLD).toBe(0.45);
    expect(module.FACE_DESCRIPTOR_LENGTH).toBe(128);
  });

  it('marks the owned inference canvas for frequent pixel readback', async () => {
    installFaceApi();
    const module = await import('./faceAi');
    const video = document.createElement('video');
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 2 },
      videoWidth: { configurable: true, value: 640 },
      videoHeight: { configurable: true, value: 480 },
    });

    await module.detectFaceWithDetailsDownscaled(video);

    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith(
      '2d',
      { willReadFrequently: true },
    );
  });
});
