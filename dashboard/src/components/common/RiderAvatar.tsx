import { useState, useMemo } from 'react';

interface RiderAvatarProps {
  src?: string | null;
  name: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * High-performance, Supabase egress-safe avatar component.
 * 1. Prioritizes real profile photo (face_image_url / avatar_url).
 * 2. Employs browser lazy loading (loading="lazy") and async decoding (decoding="async") to protect Supabase bandwidth.
 * 3. Gracefully catches image load errors (404/expired URLs) with an immediate lightweight fallback.
 */
export function RiderAvatar({ src, name, className = 'w-7 h-7', size }: RiderAvatarProps) {
  const [hasError, setHasError] = useState<boolean>(false);

  const sizeClass = size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-10 h-10' : className;

  const fallbackUrl = useMemo(() => {
    return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name || 'Rider')}`;
  }, [name]);

  const resolvedSrc = !hasError && src && src.trim() !== '' ? src : fallbackUrl;

  return (
    <img
      src={resolvedSrc}
      alt={name || 'Rider Avatar'}
      loading="lazy"
      decoding="async"
      onError={() => setHasError(true)}
      className={`${sizeClass} rounded-full bg-panel-bg border border-border object-cover shrink-0 select-none`}
    />
  );
}
