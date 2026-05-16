import L from 'leaflet';
import type { Rider } from '../../services/mockData';
/**
 * Builds a Leaflet divIcon for a rider pin with status-colored styling.
 * Using divIcon avoids the default Leaflet marker asset issues (broken image URLs).
 */
export function buildRiderIcon(
rider: Rider,
opts: {
  showLabel?: boolean;
} = {})
: L.DivIcon {
  const initials = rider.name.
  split(' ').
  map((p) => p[0]).
  slice(0, 2).
  join('').
  toUpperCase();
  const label = opts.showLabel ?
  `<div style="position:absolute;top:26px;left:50%;transform:translateX(-50%);padding:2px 6px;border-radius:4px;background:#FFFFFF;color:#1A1410;font-size:10px;font-family:'Geist Mono',monospace;white-space:nowrap;border:1px solid #EFEAE2;box-shadow:0 1px 2px rgba(0,0,0,0.08);">${rider.name}</div>` :
  '';
  return L.divIcon({
    className: 'ar-marker',
    html: `<div style="position:relative;"><div class="ar-rider-pin ${rider.status}">${initials}</div>${label}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14]
  });
}
export function renderRiderPopup(rider: Rider, zoneName: string): string {
  const statusColor =
  rider.status === 'active' ?
  '#16A34A' :
  rider.status === 'idle' ?
  '#D97706' :
  rider.status === 'violation' ?
  '#DC2626' :
  '#6B6258';
  return `
    <div style="min-width:200px;color:#1A1410;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <img src="${rider.avatar}" alt="" style="width:36px;height:36px;border-radius:9999px;background:#FAFAF7;border:1px solid #EFEAE2;" />
        <div>
          <div style="color:#1A1410;font-weight:600;font-size:13px;">${rider.name}</div>
          <div style="color:#6B6258;font-family:'Geist Mono',monospace;font-size:11px;">${rider.riderCode}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid #EFEAE2;">
        <span style="color:#6B6258;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Zone</span>
        <span style="color:#1A1410;font-size:12px;">${zoneName}</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid #EFEAE2;">
        <span style="color:#6B6258;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Status</span>
        <span style="color:${statusColor};font-size:12px;text-transform:capitalize;font-weight:600;">${rider.status}</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid #EFEAE2;">
        <span style="color:#6B6258;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Coords</span>
        <span style="color:#1A1410;font-family:'Geist Mono',monospace;font-size:11px;">${rider.lat.toFixed(4)}, ${rider.lng.toFixed(4)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid #EFEAE2;">
        <span style="color:#6B6258;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Speed</span>
        <span style="color:#1A1410;font-family:'Geist Mono',monospace;font-size:11px;">${Math.round(rider.speed)} km/h</span>
      </div>
    </div>
  `;
}