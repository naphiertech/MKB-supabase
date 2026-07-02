import { Circle, Polygon, Tooltip } from 'react-leaflet';
import type { Zone } from '../../services/types';

interface GeofenceCircleProps {
  zone: Zone;
  highlighted?: boolean;
  dimmed?: boolean;
  showLabel?: boolean;
  onClick?: (zoneId: string) => void;
  /** When true and circle is in default state (not highlighted/dimmed), bump opacities for legibility over satellite imagery. */
  satelliteMode?: boolean;
}

export function GeofenceCircle({
  zone,
  highlighted,
  dimmed,
  showLabel,
  onClick,
  satelliteMode,
}: GeofenceCircleProps) {
  const isDefault = !highlighted && !dimmed;
  const opacity = highlighted
    ? 1
    : dimmed
      ? 0.35
      : satelliteMode && isDefault
        ? 1
        : 0.7;
  const fillOpacity = highlighted
    ? 0.14
    : dimmed
      ? 0.03
      : satelliteMode && isDefault
        ? 0.18
        : 0.06;
  const weight = highlighted ? 3 : 1.5;
  const dashArray = highlighted ? undefined : '6 6';

  const pathOptions = {
    color: zone.color,
    weight,
    opacity,
    fillColor: zone.color,
    fillOpacity,
    dashArray,
    className: highlighted ? 'ar-zone-glow' : undefined,
  };

  const eventHandlers = onClick
    ? {
        click: () => onClick(zone.id),
      }
    : undefined;

  // Render Polygon shape if zone type is polygon
  if (zone.zone_type === 'polygon' && zone.polygon_coordinates) {
    return (
      <Polygon
        positions={zone.polygon_coordinates}
        pathOptions={pathOptions}
        eventHandlers={eventHandlers}
      >
        {showLabel && (
          <Tooltip permanent direction="center" className="ar-zone-tooltip" opacity={1}>
            {zone.name}
          </Tooltip>
        )}
      </Polygon>
    );
  }

  // Fallback to traditional Circle
  return (
    <Circle
      center={zone.center}
      radius={zone.radius}
      pathOptions={pathOptions}
      eventHandlers={eventHandlers}
    >
      {showLabel && (
        <Tooltip permanent direction="center" className="ar-zone-tooltip" opacity={1}>
          {zone.name}
        </Tooltip>
      )}
    </Circle>
  );
}
