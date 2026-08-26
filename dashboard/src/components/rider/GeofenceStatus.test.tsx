import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GeofenceStatus } from './GeofenceStatus';

describe('Rider My Location zone status metadata', () => {
  it('shows the real radius for a resolved circle zone', () => {
    const html = renderToStaticMarkup(<GeofenceStatus
      inZone
      zoneName="Talon-Talon"
      zoneType="circle"
      geometryResolved
      distance={102}
      radius={500}
    />);

    expect(html).toContain('102m from center');
    expect(html).toContain('500m radius');
  });

  it('describes polygon membership without displaying a radius', () => {
    const html = renderToStaticMarkup(<GeofenceStatus
      inZone
      zoneName="Divisoria, Putik and Guiwan"
      zoneType="polygon"
      geometryResolved
      distance={1027}
      radius={0}
    />);

    expect(html).toContain('Inside assigned boundary');
    expect(html).not.toContain('0m radius');
  });

  it('uses a neutral state when authoritative zone geometry is unresolved', () => {
    const html = renderToStaticMarkup(<GeofenceStatus
      inZone={false}
      zoneName="Assigned zone"
      zoneType="circle"
      geometryResolved={false}
      distance={null}
      radius={null}
    />);

    expect(html).toContain('Zone geometry unavailable');
    expect(html).not.toContain('0m');
    expect(html).not.toContain('outside your zone');
  });
});
