/**
 * Facial Recognition and Image Processing AI Engine.
 * Coordinates face-api.js (TensorFlow) and OpenCV.js dynamically.
 */


let modelsLoadedPromise: Promise<void> | null = null;

/**
 * Checks if the global CDN scripts are loaded and available.
 */
export function getFaceAiGlobals() {
  const faceapi = (window as any).faceapi;
  const cv = (window as any).cv;
  return { faceapi, cv };
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
      const FALLBACK_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
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
    img.crossOrigin = 'anonymous'; // Prevent CORS taint issues
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
