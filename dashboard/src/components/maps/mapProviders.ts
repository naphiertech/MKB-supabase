import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/** Shared keyless street tiles; independent of application theme and Satellite. */
export const STREET_BASEMAP = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
} as const;

export const SATELLITE_BASEMAP = {
  url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  attribution: '&copy; Google',
  subdomains: 'abc',
} as const;

export const SATELLITE_LABELS_LAYER = {
  url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  subdomains: 'abcd',
} as const;

export const MAP_TILE_LAYERS = {
  dark: {
    ...STREET_BASEMAP,
    subdomains: 'abcd',
  },
  satellite: SATELLITE_BASEMAP,
} as const;

/**
 * Attaches a ResizeObserver to the Leaflet map container and performs
 * staggered size invalidations to handle CSS transitions and drawer opens.
 */
export function useMapResizeObserver(triggerDependency?: unknown): void {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });

    resizeObserver.observe(container);
    map.invalidateSize();

    const intervals = [50, 100, 150, 200, 300, 400, 600, 1000];
    const timers = intervals.map((ms) => setTimeout(() => map.invalidateSize(), ms));

    return () => {
      resizeObserver.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [map, triggerDependency]);
}

/**
 * Drop-in controller component that invokes useMapResizeObserver.
 */
export function MapResizeController({ triggerDependency }: { triggerDependency?: unknown }) {
  useMapResizeObserver(triggerDependency);
  return null;
}
