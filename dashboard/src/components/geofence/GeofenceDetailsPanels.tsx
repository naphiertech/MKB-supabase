import { useState } from 'react';
import type { Zone, Rider, ViolationEvent } from '../../services/types';
import { 
  Search, 
  MapPin, 
  AlertTriangle,
  X 
} from 'lucide-react';

interface GeofenceDetailsPanelProps {
  type: 'total_zones' | 'active_zones' | 'riders_assigned' | 'violations_today';
  onClose: () => void;
  zones: Zone[];
  riders: Rider[];
  violations: ViolationEvent[];
  onFocusZone: (zoneId: string) => void;
}

export function GeofenceDetailsPanel({
  type,
  onClose,
  zones,
  riders,
  violations,
  onFocusZone
}: GeofenceDetailsPanelProps) {
  
  // Theme mappings based on card styles
  const themes = {
    total_zones: {
      border: 'border-[#db6c00]/30',
      bg: 'bg-[#FFF1E0]/5',
      badge: 'bg-[#FFF1E0] text-[#db6c00] border-[#db6c00]/20',
      title: 'Total Configured Zones Details'
    },
    active_zones: {
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-50/5',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      title: 'Active Geofenced Zones'
    },
    riders_assigned: {
      border: 'border-amber-500/30',
      bg: 'bg-amber-50/5',
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      title: 'Riders Assignments'
    },
    violations_today: {
      border: 'border-red-500/30',
      bg: 'bg-red-50/5',
      badge: 'bg-red-50 text-red-700 border-red-200',
      title: 'Geofence Violations Logged Today'
    }
  };

  const currentTheme = themes[type];

  return (
    <div className={`border-2 ${currentTheme.border} rounded-xl bg-white p-5 shadow-sm space-y-4 transition-all duration-300 relative`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#EFEAE2] pb-3">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider border ${currentTheme.badge}`}>
            {type.replace('_', ' ')}
          </span>
          <h3 className="text-sm font-semibold text-[#1A1410]">{currentTheme.title}</h3>
        </div>
        <button 
          onClick={onClose} 
          className="text-[#6B6258] hover:text-[#1A1410] p-1.5 rounded-lg hover:bg-[#FAFAF7] transition-all"
          aria-label="Close Details Panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Panel rendering */}
      {type === 'total_zones' && (
        <ZonesTableDetail zones={zones} onFocusZone={onFocusZone} />
      )}
      {type === 'active_zones' && (
        <ZonesTableDetail zones={zones.filter(z => (z.status ?? 'active') === 'active')} onFocusZone={onFocusZone} />
      )}
      {type === 'riders_assigned' && (
        <RidersAssignedDetail riders={riders} zones={zones} />
      )}
      {type === 'violations_today' && (
        <ViolationsTodayDetail violations={violations} />
      )}
    </div>
  );
}

/* ==========================================================================
   1. Zones List/Table Detail
   ========================================================================== */
interface ZonesTableDetailProps {
  zones: Zone[];
  onFocusZone: (zoneId: string) => void;
}

function ZonesTableDetail({ zones, onFocusZone }: ZonesTableDetailProps) {
  return (
    <div className="max-h-[300px] overflow-y-auto pr-1 border border-[#EFEAE2] rounded-xl bg-white custom-scrollbar">
      {zones.length === 0 ? (
        <div className="text-center py-12 text-xs text-[#6B6258]">No zones match.</div>
      ) : (
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="bg-[#FAFAF7] border-b border-[#EFEAE2] text-[10px] uppercase tracking-wider font-semibold text-[#6B6258]">
              <th className="px-4 py-2.5">Zone Name</th>
              <th className="px-4 py-2.5">Center (Lat, Lng)</th>
              <th className="px-4 py-2.5">Radius</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEAE2]">
            {zones.map((zone) => (
              <tr key={zone.id} className="hover:bg-[#FFF1E0]/20 transition-all">
                <td className="px-4 py-3 font-semibold text-[#1A1410]">{zone.name}</td>
                <td className="px-4 py-3 font-mono text-[#6B6258]">
                  {zone.center[0].toFixed(5)}, {zone.center[1].toFixed(5)}
                </td>
                <td className="px-4 py-3 text-[#6B6258] font-mono">
                  {zone.zone_type === 'polygon' ? 'Custom Polygon' : `${zone.radius.toLocaleString()} m`}
                </td>
                <td className="px-4 py-3">
                  {(zone.status ?? 'active') === 'active' ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-50 text-gray-500 border border-gray-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onFocusZone(zone.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-[10px] font-semibold text-white bg-[#db6c00] hover:bg-[#b85a00] rounded-lg transition-all shadow-sm active:scale-[0.98]"
                  >
                    <MapPin className="w-3 h-3" />
                    Focus Map
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ==========================================================================
   2. Riders Assigned Detail List
   ========================================================================== */
interface RidersAssignedDetailProps {
  riders: Rider[];
  zones: Zone[];
}

function RidersAssignedDetail({ riders, zones }: RidersAssignedDetailProps) {
  const [riderSearchText, setRiderSearchText] = useState('');

  const filteredRiders = riders.filter((r) =>
    !riderSearchText ||
    r.name.toLowerCase().includes(riderSearchText.toLowerCase()) ||
    r.riderCode.toLowerCase().includes(riderSearchText.toLowerCase())
  );

  return (
    <div className="space-y-3">
      {/* Search Field */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#6B6258]" />
        <input
          type="text"
          placeholder="Search riders by name or code..."
          value={riderSearchText}
          onChange={(e) => setRiderSearchText(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAFAF7] border border-[#EFEAE2] rounded-lg outline-none focus:border-[#db6c00]/50 focus:bg-white text-[#1A1410] transition-colors"
        />
      </div>

      <div className="max-h-[260px] overflow-y-auto pr-1 border border-[#EFEAE2] rounded-xl bg-white custom-scrollbar">
        {filteredRiders.length === 0 ? (
          <div className="text-center py-12 text-xs text-[#6B6258]">No riders match your search.</div>
        ) : (
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-[#FAFAF7] border-b border-[#EFEAE2] text-[10px] uppercase tracking-wider font-semibold text-[#6B6258]">
                <th className="px-4 py-2.5">Rider</th>
                <th className="px-4 py-2.5">Assigned Zone</th>
                <th className="px-4 py-2.5">Current Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE2]">
              {filteredRiders.map((rider) => {
                const zone = rider.zoneId ? zones.find((z) => z.id === rider.zoneId) : null;
                return (
                  <tr key={rider.id} className="hover:bg-[#FFF1E0]/20 transition-all">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {rider.avatar ? (
                          <img
                            src={rider.avatar}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover border border-[#EFEAE2]"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[#FFF1E0] flex items-center justify-center font-bold text-[#db6c00] text-xs">
                            {rider.name.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-[#1A1410] font-semibold truncate">{rider.name}</div>
                          <div className="text-[9px] text-[#6B6258] font-mono">{rider.riderCode}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {zone ? (
                        <span className="inline-flex items-center gap-1.5 text-[#1A1410] font-semibold">
                          <span
                            className="w-2.5 h-2.5 rounded-full ring-1 ring-white shadow-sm"
                            style={{ background: zone.color }}
                          />
                          {zone.name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold text-gray-500 bg-gray-50 border border-gray-200">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          rider.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                          rider.status === 'idle' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                          rider.status === 'violation' ? 'bg-red-50 text-red-700 border border-red-100' :
                          'bg-gray-50 text-gray-600 border border-gray-200'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            rider.status === 'active' ? 'bg-emerald-500' :
                            rider.status === 'idle' ? 'bg-amber-500' :
                            rider.status === 'violation' ? 'bg-red-500' :
                            'bg-gray-400'
                          }`}
                        />
                        {rider.status.charAt(0).toUpperCase() + rider.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   3. Violations Today Detail List
   ========================================================================== */
interface ViolationsTodayDetailProps {
  violations: ViolationEvent[];
}

function ViolationsTodayDetail({ violations }: ViolationsTodayDetailProps) {
  const getViolationLabel = (type: ViolationEvent['type']) => {
    switch (type) {
      case 'boundary_exit':
        return 'Boundary Exit';
      case 'boundary_enter':
        return 'Boundary Enter';
      case 'idle_excess':
        return 'Excessive Idle';
      default:
        return type;
    }
  };

  return (
    <div className="max-h-[300px] overflow-y-auto pr-1 border border-[#EFEAE2] rounded-xl bg-white custom-scrollbar">
      {violations.length === 0 ? (
        <div className="text-center py-12 text-xs text-[#6B6258]">No violations tracked today.</div>
      ) : (
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="bg-[#FAFAF7] border-b border-[#EFEAE2] text-[10px] uppercase tracking-wider font-semibold text-[#6B6258]">
              <th className="px-4 py-2.5">Rider</th>
              <th className="px-4 py-2.5">Zone</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5 text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEAE2]">
            {violations.map((v) => (
              <tr key={v.id} className="hover:bg-red-50/10 transition-all">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-[10px] font-bold text-red-600 flex-shrink-0">
                      {v.riderName.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-[#1A1410] font-semibold">{v.riderName}</div>
                  </div>
                </td>
                <td className="px-4 py-3 text-[#6B6258]">{v.zoneName}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700 border border-red-100">
                    <AlertTriangle className="w-3 h-3 text-red-600" />
                    {getViolationLabel(v.type)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-[#6B6258] font-mono">
                  {new Date(v.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
