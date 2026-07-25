import { getStorageAdapter } from './storage';

export interface DeviceIdentifierResult {
  deviceUuid: string;
  fingerprintHash: string;
  deviceName: string;
  platform: 'web' | 'android' | 'ios';
  userAgent: string;
}

const DEVICE_UUID_KEY = 'attenrider_device_uuid';

/**
 * Generates a unique UUID v4 string for client device identification.
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Computes a SHA-256 digest string from an input text using Web Crypto API.
 */
async function sha256(message: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback simple hash if subtle crypto fails
    }
  }

  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    const char = message.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `fallback_${Math.abs(hash).toString(16)}`;
}

/**
 * Obtains persistent device UUID with dual storage (localStorage + Dexie kv-store).
 */
async function getOrCreatePersistentDeviceUuid(): Promise<string> {
  if (typeof window === 'undefined') {
    return generateUUID();
  }

  // 1. Read from localStorage
  const localUuid = localStorage.getItem(DEVICE_UUID_KEY);

  // 2. Read from Dexie IndexedDB storage adapter
  let dexieUuid: string | null = null;
  try {
    const storage = getStorageAdapter();
    const val = await storage.getItem(DEVICE_UUID_KEY);
    if (val && typeof val === 'string') {
      dexieUuid = val;
    }
  } catch (err) {
    console.debug('[DeviceFingerprint] Failed to read IndexedDB device UUID:', err);
  }

  // Sync dual storage
  if (localUuid && !dexieUuid) {
    try {
      const storage = getStorageAdapter();
      await storage.setItem(DEVICE_UUID_KEY, localUuid);
    } catch (err) {
      console.debug('[DeviceFingerprint] Failed to sync to IndexedDB:', err);
    }
    return localUuid;
  }

  if (!localUuid && dexieUuid) {
    localStorage.setItem(DEVICE_UUID_KEY, dexieUuid);
    return dexieUuid;
  }

  if (localUuid && dexieUuid) {
    return localUuid;
  }

  // First time creation on this device
  const newUuid = generateUUID();
  localStorage.setItem(DEVICE_UUID_KEY, newUuid);
  try {
    const storage = getStorageAdapter();
    await storage.setItem(DEVICE_UUID_KEY, newUuid);
  } catch (err) {
    console.debug('[DeviceFingerprint] Failed to write new UUID to IndexedDB:', err);
  }

  return newUuid;
}

/**
 * Generates canvas 2D fingerprint hash component.
 */
function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no_canvas';

    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);

    ctx.fillStyle = '#069';
    ctx.fillText('AttenRider Device 1.0', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('AttenRider Device 1.0', 4, 17);

    return canvas.toDataURL();
  } catch {
    return 'canvas_error';
  }
}

/**
 * Generates WebGL vendor / renderer fingerprint string.
 */
function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl || !(gl instanceof WebGLRenderingContext)) return 'no_webgl';

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'no_debug_info';

    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
    return `${vendor}~${renderer}`;
  } catch {
    return 'webgl_error';
  }
}

/**
 * Generates a human-readable device name based on User-Agent.
 */
export function getFriendlyDeviceName(ua: string): string {
  let browser = 'Browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('OPR/') || ua.includes('Opera/')) browser = 'Opera';

  let os = 'Device';
  if (ua.includes('Windows NT')) os = 'Windows';
  else if (ua.includes('Android')) os = 'Android Device';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS Device';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return `${browser} on ${os}`;
}

/**
 * Computes composite hardware fingerprint and returns device identification.
 */
export async function getDeviceIdentifier(): Promise<DeviceIdentifierResult> {
  if (typeof window === 'undefined') {
    return {
      deviceUuid: 'server_env',
      fingerprintHash: 'server_env',
      deviceName: 'Server',
      platform: 'web',
      userAgent: 'server'
    };
  }

  // Capacitor Native Hardware Platform Check (Pre-wired for Phase 5)
  if ((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) {
    try {
      const capModule = '@capacitor/device';
      const { Device } = await import(/* @vite-ignore */ capModule);
      const info = await Device.getId();
      const model = await Device.getInfo();
      return {
        deviceUuid: info.identifier,
        fingerprintHash: info.identifier,
        deviceName: `${model.manufacturer} ${model.model}`,
        platform: (model.platform as 'android' | 'ios') || 'android',
        userAgent: navigator.userAgent || 'Capacitor Native'
      };
    } catch {
      // Fallback to web implementation if native plugin fails
    }
  }

  const deviceUuid = await getOrCreatePersistentDeviceUuid();
  const ua = navigator.userAgent || '';
  const screenResolution = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const language = navigator.language || '';
  const hardwareConcurrency = navigator.hardwareConcurrency || 2;
  const canvasFp = getCanvasFingerprint();
  const webglFp = getWebGLFingerprint();

  const rawFingerprintString = [
    ua,
    screenResolution,
    timezone,
    language,
    hardwareConcurrency,
    canvasFp,
    webglFp
  ].join('||');

  const fingerprintHash = await sha256(rawFingerprintString);
  const deviceName = getFriendlyDeviceName(ua);

  let platform: 'web' | 'android' | 'ios' = 'web';
  if (/Android/i.test(ua)) platform = 'android';
  else if (/iPhone|iPad|iPod/i.test(ua)) platform = 'ios';

  return {
    deviceUuid,
    fingerprintHash,
    deviceName,
    platform,
    userAgent: ua
  };
}
