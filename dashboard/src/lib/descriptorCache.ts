/**
 * Persistent Client-Side Facial Descriptor Cache.
 * Avoids re-downloading and re-computing 128D Float32Array embeddings on every session.
 */

const CACHE_PREFIX = 'mkb_face_desc_v1_';

export function getCachedDescriptor(riderId: string, avatarUrl?: string | null): number[] | null {
  if (!riderId && !avatarUrl) return null;
  try {
    const keysToTry = [riderId, avatarUrl].filter(Boolean) as string[];
    for (const key of keysToTry) {
      const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.descriptor) && parsed.descriptor.length === 128) {
        return parsed.descriptor;
      }
    }
  } catch (err) {
    console.warn('[DescriptorCache] Failed to read cached descriptor:', err);
  }
  return null;
}

export function setCachedDescriptor(riderId: string, descriptor: number[], avatarUrl?: string | null): void {
  if ((!riderId && !avatarUrl) || !descriptor || descriptor.length !== 128) return;
  try {
    const payload = {
      avatarUrl: avatarUrl || '',
      descriptor,
      ts: Date.now()
    };
    if (riderId) {
      localStorage.setItem(`${CACHE_PREFIX}${riderId}`, JSON.stringify(payload));
    }
    if (avatarUrl && avatarUrl !== riderId) {
      localStorage.setItem(`${CACHE_PREFIX}${avatarUrl}`, JSON.stringify(payload));
    }
    console.log(`[DescriptorCache] Saved 128D facial descriptor to LocalStorage for key ${riderId || avatarUrl}.`);
  } catch (err) {
    console.warn('[DescriptorCache] Failed to save descriptor to LocalStorage:', err);
  }
}
