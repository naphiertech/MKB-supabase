/**
 * Persistent Client-Side Facial Descriptor Cache.
 * Avoids re-downloading and re-computing 128D Float32Array embeddings on every session.
 */

const CACHE_PREFIX = 'mkb_face_desc_v1_';

interface CachedDescriptorPayload {
  avatarUrl: string;
  descriptor: number[];
  ts: number;
}

function descriptorsMatch(left: unknown, right: number[]): boolean {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function cacheEntryMatches(raw: string | null, descriptor: number[], avatarUrl: string): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Partial<CachedDescriptorPayload>;
    return parsed.avatarUrl === avatarUrl && descriptorsMatch(parsed.descriptor, descriptor);
  } catch {
    return false;
  }
}

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
    const normalizedAvatarUrl = avatarUrl || '';
    const payload = {
      avatarUrl: normalizedAvatarUrl,
      descriptor,
      ts: Date.now()
    };

    const keys = [riderId, avatarUrl && avatarUrl !== riderId ? avatarUrl : null]
      .filter(Boolean) as string[];
    const serializedPayload = JSON.stringify(payload);

    for (const key of keys) {
      const storageKey = `${CACHE_PREFIX}${key}`;
      if (!cacheEntryMatches(localStorage.getItem(storageKey), descriptor, normalizedAvatarUrl)) {
        localStorage.setItem(storageKey, serializedPayload);
      }
    }
  } catch (err) {
    console.warn('[DescriptorCache] Failed to save descriptor to LocalStorage:', err);
  }
}
