/**
 * Persistent Client-Side Facial Descriptor Cache.
 * Avoids re-downloading and re-computing 128D Float32Array embeddings on every session.
 */

const CACHE_PREFIX = 'mkb_face_desc_v1_';

export function getCachedDescriptor(riderId: string, avatarUrl?: string | null): number[] | null {
  if (!riderId) return null;
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${riderId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    // Invalidate if avatar URL changed
    if (avatarUrl && parsed.avatarUrl && parsed.avatarUrl !== avatarUrl) {
      localStorage.removeItem(`${CACHE_PREFIX}${riderId}`);
      return null;
    }

    if (Array.isArray(parsed.descriptor) && parsed.descriptor.length === 128) {
      return parsed.descriptor;
    }
  } catch (err) {
    console.warn('[DescriptorCache] Failed to read cached descriptor:', err);
  }
  return null;
}

export function setCachedDescriptor(riderId: string, descriptor: number[], avatarUrl?: string | null): void {
  if (!riderId || !descriptor || descriptor.length !== 128) return;
  try {
    const payload = {
      avatarUrl: avatarUrl || '',
      descriptor,
      ts: Date.now()
    };
    localStorage.setItem(`${CACHE_PREFIX}${riderId}`, JSON.stringify(payload));
    console.log(`[DescriptorCache] Saved 128D facial descriptor to LocalStorage for rider ${riderId}.`);
  } catch (err) {
    console.warn('[DescriptorCache] Failed to save descriptor to LocalStorage:', err);
  }
}
