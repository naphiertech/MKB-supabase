/**
 * Facial Recognition and Image Processing AI Engine.
 * Coordinates face-api.js (TensorFlow) and OpenCV.js dynamically.
 */

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
  euclideanDistance(desc1: Float32Array, desc2: Float32Array): number;
}

interface CvInstance {
  Mat: new () => { delete(): void };
  imread(canvas: HTMLCanvasElement): { delete(): void };
  cvtColor(src: { delete(): void }, dst: { delete(): void }, code: number): void;
  equalizeHist(src: { delete(): void }, dst: { delete(): void }): void;
  imshow(canvas: HTMLCanvasElement, mat: { delete(): void }): void;
  COLOR_RGBA2GRAY: number;
}

interface WindowWithAi extends Window {
  faceapi?: FaceApiInstance;
  cv?: CvInstance;
}

let modelsLoadedPromise: Promise<void> | null = null;

/**
 * Checks if the global CDN scripts are loaded and available.
 */
export function getFaceAiGlobals() {
  const w = window as unknown as WindowWithAi;
  return { faceapi: w.faceapi, cv: w.cv };
}

/**
 * Wait for globally loaded CDN scripts (face-api and opencv) to be parsed on the window.
 * Retries for up to 10 seconds.
 */
export function ensureScriptsLoaded(): Promise<boolean> {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      const { faceapi, cv } = getFaceAiGlobals();
      // OpenCV.js is optional (pre-processing checks if it exists), but face-api.js is mandatory.
      if (faceapi) {
        if (cv && typeof cv.Mat === 'function') {
          console.log('Facial AI engines (TensorFlow + OpenCV) fully initialized.');
        } else {
          console.log('TensorFlow.js face-api initialized. OpenCV.js is still loading or unavailable (falling back to raw frame capturing).');
        }
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
  if (modelsLoadedPromise) return modelsLoadedPromise;

  modelsLoadedPromise = (async () => {
    const { faceapi } = getFaceAiGlobals();
    if (!faceapi) throw new Error('face-api.js is not loaded.');

    try {
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri('/models/'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models/'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models/')
      ]);
      console.log('TensorFlow.js SSD MobileNet face models loaded locally from /models/.');
    } catch (localErr) {
      console.warn('Failed to load local models from /models/, falling back to online CDN registry...', localErr);
      const FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/';
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(FALLBACK_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(FALLBACK_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(FALLBACK_URL)
      ]);
      console.log('TensorFlow.js SSD MobileNet face models loaded from fallback online CDN.');
    }
  })();

  return modelsLoadedPromise;
}

/**
 * Pre-processes a captured canvas element using OpenCV.js.
 * Converts to Grayscale and applies Histogram Equalization to compensate for poor lighting conditions.
 */
export async function preprocessWithOpenCV(canvas: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const { cv } = getFaceAiGlobals();
  if (!cv || typeof cv.Mat !== 'function') return canvas;

  try {
    const src = cv.imread(canvas);
    const dst = new cv.Mat();
    
    // Grayscale conversion
    cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
    
    // Histogram Equalization
    cv.equalizeHist(dst, dst);
    
    // Write back to canvas
    cv.imshow(canvas, dst);
    
    src.delete();
    dst.delete();
  } catch (err) {
    console.warn('OpenCV pre-processing error:', err);
  }
  return canvas;
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
    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45 });
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
    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45 });
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
    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45 });
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
  threshold = 0.6
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
  if (landmarkerInstance) return landmarkerInstance;
  if (landmarkerPromise) return landmarkerPromise;

  landmarkerPromise = (async () => {
    try {
      const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
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
