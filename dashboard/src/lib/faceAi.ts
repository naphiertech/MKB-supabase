/**
 * Facial Recognition and Image Processing AI Engine.
 * Coordinates face-api.js (TensorFlow) and MediaPipe dynamically.
 */

import { BIOMETRIC_TIMING_NAMES, biometricTelemetry } from './biometricTelemetry';

export { createBiometricTelemetry } from './biometricTelemetry';

export const FACE_MATCH_THRESHOLD = 0.45;
export const FACE_DESCRIPTOR_LENGTH = 128;
const FACE_DETECTION_MIN_CONFIDENCE = 0.45;
const FACE_API_MODEL_PATH = '/models/face-api-0.22.2/';

interface FaceDetectionBox {
  box: { x: number; y: number; width: number; height: number };
}

interface FaceDetectionFull extends FaceDetectionBox {
  descriptor: Float32Array;
  landmarks: {
    getLeftEye(): { x: number; y: number }[];
    getRightEye(): { x: number; y: number }[];
  };
  detection: {
    box: { x: number; y: number; width: number; height: number };
  };
}

interface FaceDetectionWithLandmarksChain extends Promise<FaceDetectionFull | undefined> {
  withFaceDescriptor(): Promise<FaceDetectionFull | undefined>;
}

interface FaceDetectionChain extends Promise<FaceDetectionBox | undefined> {
  withFaceLandmarks(): FaceDetectionWithLandmarksChain;
}

interface FaceApiInstance {
  nets: {
    ssdMobilenetv1: { loadFromUri(uri: string): Promise<void> };
    faceLandmark68Net: { loadFromUri(uri: string): Promise<void> };
    faceRecognitionNet: { loadFromUri(uri: string): Promise<void> };
  };
  SsdMobilenetv1Options: new (options: { minConfidence: number }) => Record<string, never>;
  detectSingleFace(
    element: unknown,
    options?: unknown
  ): FaceDetectionChain;
  detectFaceLandmarks(element: unknown): Promise<unknown>;
  computeFaceDescriptor(element: unknown): Promise<Float32Array>;
  euclideanDistance(desc1: Float32Array, desc2: Float32Array): number;
}

interface WindowWithAi extends Window {
  faceapi?: FaceApiInstance;
}

let modelsLoadedPromise: Promise<void> | null = null;
let biometricsPreloadedPromise: Promise<void> | null = null;

/**
 * Checks if the global CDN scripts are loaded and available.
 */
export function getFaceAiGlobals() {
  const w = window as unknown as WindowWithAi;
  return { faceapi: w.faceapi };
}

/**
 * Wait for the globally loaded face-api script to be parsed on the window.
 * Retries for up to 30 seconds.
 */
export function ensureScriptsLoaded(): Promise<boolean> {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      const { faceapi } = getFaceAiGlobals();
      if (faceapi) {
        resolve(true);
        return;
      }
      attempts++;
      if (attempts > 150) { // 30 seconds limit (150 * 200ms)
        console.warn('Facial AI dependencies timed out. Falling back to high-fidelity simulation.');
        resolve(false);
      } else {
        setTimeout(check, 200);
      }
    };
    check();
  });
}

/**
 * Loads the face-api.js model weights.
 * Prefers loading locally from /models/ (Offline-capable) and falls back
 * to the online CDN registry if any local files are missing.
 */
export function loadFaceModels(): Promise<void> {
  if (modelsLoadedPromise) {
    console.log('[Face AI] loadFaceModels(): REUSING ALREADY LOADED face-api.js promise.');
    return modelsLoadedPromise;
  }
  console.log('[Face AI] loadFaceModels(): NO CACHED face-api.js promise. Loading weights now...');
  const finishModelLoad = biometricTelemetry.start('face_api_model_load');

  modelsLoadedPromise = (async () => {
    const { faceapi } = getFaceAiGlobals();
    if (!faceapi) throw new Error('face-api.js is not loaded.');

    try {
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_API_MODEL_PATH),
        faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODEL_PATH),
        faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_PATH)
      ]);
    } catch (localErr) {
      console.warn(`Failed to load local models from ${FACE_API_MODEL_PATH}, falling back to the pinned registry.`, localErr);
      const FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights/';
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(FALLBACK_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(FALLBACK_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(FALLBACK_URL)
      ]);
    }
  })().catch((error) => {
    modelsLoadedPromise = null;
    throw error;
  }).finally(() => {
    finishModelLoad();
  });

  return modelsLoadedPromise;
}

/**
 * Detects a single face in a video, image, or canvas, returning its bounding box.
 */
export async function detectSingleFaceRect(
  element: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const { faceapi } = getFaceAiGlobals();
  if (!faceapi) return null;

  try {
    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: FACE_DETECTION_MIN_CONFIDENCE });
    const detection = await faceapi.detectSingleFace(element, options);
    if (!detection) return null;
    return detection.box;
  } catch (err) {
    console.warn('Face detection error:', err);
    return null;
  }
}

/**
 * Detects a single face and extracts its 128-dimensional facial embedding (descriptor).
 */
export async function getFaceDescriptor(
  element: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
): Promise<Float32Array | null> {
  const { faceapi } = getFaceAiGlobals();
  if (!faceapi) return null;

  try {
    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: FACE_DETECTION_MIN_CONFIDENCE });
    const detection = await faceapi.detectSingleFace(element, options)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) return null;
    return detection.descriptor;
  } catch (err) {
    console.warn('Descriptor extraction error:', err);
    return null;
  }
}


export interface FaceRecognitionData {
  descriptor: Float32Array;
  leftEye: { x: number; y: number }[];
  rightEye: { x: number; y: number }[];
  box: { x: number; y: number; width: number; height: number };
}

/**
 * Computes Euclidean distance between two points.
 */
function distance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Computes Eye Aspect Ratio (EAR) for a single eye.
 */
function calculateEyeRatio(eyePoints: { x: number; y: number }[]): number {
  if (!eyePoints || eyePoints.length < 6) return 0.0;
  const vertical1 = distance(eyePoints[1], eyePoints[5]);
  const vertical2 = distance(eyePoints[2], eyePoints[4]);
  const horizontal = distance(eyePoints[0], eyePoints[3]);
  return (vertical1 + vertical2) / (2.0 * horizontal);
}

/**
 * Calculates average Eye Aspect Ratio (EAR) across both eyes.
 */
export function calculateEAR(leftEye: { x: number; y: number }[], rightEye: { x: number; y: number }[]): number {
  const leftEAR = calculateEyeRatio(leftEye);
  const rightEAR = calculateEyeRatio(rightEye);
  return (leftEAR + rightEAR) / 2.0;
}

/**
 * Detects single face and extracts bounding box, eye landmarks, and descriptor.
 */
export async function detectFaceWithDetails(
  element: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
): Promise<FaceRecognitionData | null> {
  const { faceapi } = getFaceAiGlobals();
  if (!faceapi) return null;

  try {
    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: FACE_DETECTION_MIN_CONFIDENCE });
    const detection = await faceapi.detectSingleFace(element, options)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) return null;
    return {
      descriptor: detection.descriptor,
      leftEye: detection.landmarks.getLeftEye(),
      rightEye: detection.landmarks.getRightEye(),
      box: detection.detection.box
    };
  } catch (err) {
    console.warn('Face details extraction error:', err);
    return null;
  }
}

let offscreenCanvas: HTMLCanvasElement | null = null;

/**
 * Priority 4: Downscales video frames to an offscreen 320x320 canvas for AI inference
 * while keeping the visible camera stream at full native quality.
 */
export async function detectFaceWithDetailsDownscaled(
  video: HTMLVideoElement
): Promise<FaceRecognitionData | null> {
  if (!video || video.readyState < 2) return null;

  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = 320;
    offscreenCanvas.height = 320;
  }

  const ctx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, 320, 320);

  const res = await detectFaceWithDetails(offscreenCanvas);
  if (!res) return null;

  const scaleX = video.videoWidth / 320;
  const scaleY = video.videoHeight / 320;

  return {
    ...res,
    box: {
      x: res.box.x * scaleX,
      y: res.box.y * scaleY,
      width: res.box.width * scaleX,
      height: res.box.height * scaleY
    }
  };
}


/**
 * Loads a remote or local image URL as an HTMLImageElement and computes its facial embedding.
 */
export async function getDescriptorFromUrl(url: string): Promise<Float32Array | null> {
  return new Promise((resolve) => {
    const { faceapi } = getFaceAiGlobals();
    if (!faceapi) {
      resolve(null);
      return;
    }

    const img = new Image();
    if (url && !url.startsWith('data:')) {
      img.crossOrigin = 'anonymous'; // Prevent CORS taint issues
    }
    img.onload = async () => {
      try {
        const desc = await getFaceDescriptor(img);
        resolve(desc);
      } catch (err) {
        console.warn('Failed to extract descriptor from reference URL:', err);
        resolve(null);
      }
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Compares two 128-dimensional descriptors and calculates match status and Euclidean distance.
 */
export function verifyFaceIdentity(
  desc1: Float32Array,
  desc2: Float32Array,
  threshold = FACE_MATCH_THRESHOLD
): { matched: boolean; distance: number; confidence: number } {
  const { faceapi } = getFaceAiGlobals();
  if (!faceapi) return { matched: false, distance: 1.0, confidence: 0 };

  const distance = faceapi.euclideanDistance(desc1, desc2);
  const matched = distance < threshold;
  
  // Calculate confidence percentage based on distance mapping
  // A distance of 0.0 means 100% match, a distance of 0.6 is exactly the match threshold.
  const confidence = matched 
    ? 0.98 - (distance * 0.3) // Map distance to a realistic high confidence (0.80 - 0.98)
    : 0.60 - (distance * 0.2); // Map poor match to a low confidence

  return {
    matched,
    distance,
    confidence: Math.max(0.1, Math.min(0.99, confidence))
  };
}

type FaceLandmarkerType = Awaited<ReturnType<typeof import('@mediapipe/tasks-vision')['FaceLandmarker']['createFromOptions']>>;

let landmarkerPromise: Promise<FaceLandmarkerType> | null = null;
let landmarkerInstance: FaceLandmarkerType | null = null;

export async function loadMediaPipeLandmarker() {
  if (landmarkerInstance) {
    console.log('[Face AI] loadMediaPipeLandmarker(): REUSING ALREADY INITIALIZED landmarkerInstance.');
    return landmarkerInstance;
  }
  if (landmarkerPromise) {
    console.log('[Face AI] loadMediaPipeLandmarker(): REUSING ACTIVE landmarkerPromise.');
    return landmarkerPromise;
  }

  console.log('[Face AI] loadMediaPipeLandmarker(): NO CACHED landmarker found. Initializing now...');
  const finishMediaPipeLoad = biometricTelemetry.start('mediapipe_initialization');

  landmarkerPromise = (async () => {
    try {
      const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
      );
      landmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false
      });
       return landmarkerInstance;
    } catch (err) {
      console.error('Failed to initialize MediaPipe FaceLandmarker:', err);
      landmarkerPromise = null;
      throw err;
    } finally {
      finishMediaPipeLoad();
    }
  })();

  return landmarkerPromise;
}

export function calculateMediaPipeEAR(landmarks: { x: number; y: number; z: number }[]): number {
  if (!landmarks || landmarks.length < 400) return 0.0;
  
  const dist = (p1: { x: number; y: number; z: number }, p2: { x: number; y: number; z: number }) => {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = p1.z - p2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };

  // Left Eye (indices in MediaPipe Face Mesh)
  const leftVertical = dist(landmarks[159], landmarks[145]);
  const leftHorizontal = dist(landmarks[33], landmarks[133]);
  const leftEAR = leftVertical / (leftHorizontal || 1.0);

  // Right Eye (indices in MediaPipe Face Mesh)
  const rightVertical = dist(landmarks[386], landmarks[374]);
  const rightHorizontal = dist(landmarks[362], landmarks[263]);
  const rightEAR = rightVertical / (rightHorizontal || 1.0);

  return (leftEAR + rightEAR) / 2.0;
}

export function calculateHeadRoll(landmarks: { x: number; y: number; z: number }[]): number {
  if (!landmarks || landmarks.length < 400) return 0.0;
  
  // Landmark 33 is left outer corner, Landmark 263 is right outer corner
  const p1 = landmarks[33];
  const p2 = landmarks[263];
  
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  
  const angleRad = Math.atan2(dy, dx);
  const angleDeg = angleRad * (180 / Math.PI);
  
  return angleDeg;
}

/**
 * Compile every biometric inference stage using a synthetic, non-rider input.
 * No warmup descriptor is retained, compared, or persisted.
 */
export async function warmUpModels(landmarker: FaceLandmarkerType | null) {
  try {
    console.log('[Face AI] Running dummy warmups to pre-compile shaders...');
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 160, 160);
      gradient.addColorStop(0, '#202020');
      gradient.addColorStop(0.5, '#808080');
      gradient.addColorStop(1, '#e0e0e0');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 160, 160);
    }

    const { faceapi } = getFaceAiGlobals();
    if (faceapi) {
      const finishSsd = biometricTelemetry.start('ssd_detection');
      await faceapi.detectSingleFace(
        canvas,
        new faceapi.SsdMobilenetv1Options({ minConfidence: FACE_DETECTION_MIN_CONFIDENCE }),
      );
      finishSsd();

      const finishLandmarks = biometricTelemetry.start('landmark_completion');
      await faceapi.detectFaceLandmarks(canvas);
      finishLandmarks();

      const finishDescriptor = biometricTelemetry.start('descriptor_completion');
      await faceapi.computeFaceDescriptor(canvas);
      finishDescriptor();
    }

    if (landmarker && typeof landmarker.detectForVideo === 'function') {
      const finishMediaPipe = biometricTelemetry.start('warmup_mediapipe');
      landmarker.detectForVideo(canvas, Date.now());
      finishMediaPipe();
    }
    console.log('[Face AI] Biometric warmup successfully completed.');
  } catch (err) {
    console.warn('[Face AI] Warmup failed or was skipped:', err);
  }
}

/**
 * Stage-loads scripts, downloads models, and warms up the engines.
 */
export function preloadBiometrics(): Promise<void> {
  if (biometricsPreloadedPromise) {
    console.log('[Face AI] preloadBiometrics(): REUSING existing preloading promise.');
    return biometricsPreloadedPromise;
  }

  console.log('[Face AI] preloadBiometrics(): NO cached promise. Initiating preloader...');
  biometricsPreloadedPromise = (async () => {
    const finishPreload = biometricTelemetry.start(BIOMETRIC_TIMING_NAMES.preload);
    try {
      console.log('[Face AI] Pre-loading scripts...');
      const active = await ensureScriptsLoaded();
      if (!active) {
        console.warn('[Face AI] Failed to load global CDN scripts.');
        return;
      }

      console.log('[Face AI] Pre-downloading AI models...');
      // Parallel download and instantiation
      const [landmarker] = await Promise.all([
        loadMediaPipeLandmarker(),
        loadFaceModels()
      ]);

      // Warm up the models
      await warmUpModels(landmarker);
    } catch (err) {
      console.warn('[Face AI] Preloading biometrics failed:', err);
      biometricsPreloadedPromise = null; // reset to allow retry
    } finally {
      finishPreload();
    }
  })();

  return biometricsPreloadedPromise;
}

/**
 * Releases transient MediaPipe resources. Face-api weights remain resident for
 * the authenticated application session, so reuse cannot allocate them twice.
 */
export async function releaseBiometrics() {
  try {
    console.log('[Face AI] Releasing transient biometric resources...');
    if (landmarkerInstance) {
      if (typeof landmarkerInstance.close === 'function') {
        landmarkerInstance.close();
      }
      landmarkerInstance = null;
    }
    landmarkerPromise = null;
    biometricsPreloadedPromise = null;
    console.log('[Face AI] Resources released.');
  } catch (err) {
    console.warn('[Face AI] Error while releasing resources:', err);
  }
}
