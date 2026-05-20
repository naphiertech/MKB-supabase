import { useMemo, useState, ComponentType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Filter,
  ChevronLeft,
  ChevronRight,
  Phone,
  MessageSquare,
  Flag } from
'lucide-react';
import { useRealtimeLocation } from '../hooks/useRealtimeLocation';
import { zones } from '../services/mockData';
import { LiveMonitoringMap } from '../components/maps/LiveMonitoringMap';
import { EventTicker } from '../components/monitoring/EventTicker';
import { useNow, relativeTime } from '../hooks/useNow';
import { RouteTrailMap } from '../components/maps/RouteTrailMap';
import { 
  getRouteForRider, 
  computeRouteStats,
  RoutePoint,
  RouteStats
} from '../services/routeService';

export function LiveMonitoring() {
  const { riders, violations } = useRealtimeLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [shiftFilter, setShiftFilter] = useState<string>('all');
  const [focusRiderId, setFocusRiderId] = useState<string | null>(null);
  
  const [selectedRiderRoute, setSelectedRiderRoute] = useState<RoutePoint[]>([]);
  const [selectedRiderStats, setSelectedRiderStats] = useState<RouteStats | null>(null);
  const [routeDrawerOpen, setRouteDrawerOpen] = useState(false);
  const [isRouteFullscreen, setIsRouteFullscreen] = useState(false);

  const now = useNow();
  const filtered = useMemo(() => {
    return riders.filter(
      (r) =>
      (zoneFilter === 'all' || r.zoneId === zoneFilter) && (
      statusFilter === 'all' || r.status === statusFilter) && (
      shiftFilter === 'all' || r.shift === shiftFilter)
    );
  }, [riders, zoneFilter, statusFilter, shiftFilter]);
  const focused = riders.find((r) => r.id === focusRiderId);
  const focusedZone = focused ?
  zones.find((z) => z.id === focused.zoneId) :
  null;

  const handleRiderClick = async (riderId: string) => {
    setFocusRiderId(riderId);
    const points = await getRouteForRider(riderId);
    setSelectedRiderRoute(points);
    setSelectedRiderStats(computeRouteStats(points));
    setRouteDrawerOpen(true);
  };
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex-1 flex overflow-hidden">
        {/* Left rail */}
        <aside
          className={`${collapsed ? 'w-12' : 'w-80'} shrink-0 bg-white border-r border-[#EFEAE2] transition-all flex flex-col`}>
          
          <div className="flex items-center justify-between p-3 border-b border-[#EFEAE2]">
            {!collapsed &&
            <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-[#db6c00]" />
                <span className="text-sm font-semibold text-[#1A1410]">
                  Filters
                </span>
              </div>
            }
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="p-1.5 rounded-md text-[#6B6258] hover:text-[#1A1410] hover:bg-[#FAFAF7]"
              aria-label="Toggle rail">
              
              {collapsed ?
              <ChevronRight className="w-4 h-4" /> :

              <ChevronLeft className="w-4 h-4" />
              }
            </button>
          </div>

          {!collapsed &&
          <>
              <div className="p-3 space-y-3 border-b border-[#EFEAE2]">
                <FilterRow
                label="Zone"
                value={zoneFilter}
                onChange={setZoneFilter}
                options={[
                {
                  v: 'all',
                  l: 'All Zones'
                },
                ...zones.map((z) => ({
                  v: z.id,
                  l: z.name
                }))]
                } />
              
                <FilterRow
                label="Status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                {
                  v: 'all',
                  l: 'All'
                },
                {
                  v: 'active',
                  l: 'Active'
                },
                {
                  v: 'idle',
                  l: 'Idle'
                },
                {
                  v: 'violation',
                  l: 'Violation'
                }]
                } />
              
                <FilterRow
                label="Shift"
                value={shiftFilter}
                onChange={setShiftFilter}
                options={[
                {
                  v: 'all',
                  l: 'All'
                },
                {
                  v: 'morning',
                  l: 'Morning'
                },
                {
                  v: 'afternoon',
                  l: 'Afternoon'
                },
                {
                  v: 'evening',
                  l: 'Evening'
                }]
                } />
              
              </div>

              <div className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[#6B6258] font-mono font-semibold">
                Riders · {filtered.length}
              </div>
              <div className="ar-scroll overflow-y-auto flex-1 px-2 pb-2 space-y-1">
                {filtered.map((r) => {
                const z = zones.find((z) => z.id === r.zoneId);
                const ring =
                r.status === 'active' ?
                'ring-emerald-500/70' :
                r.status === 'idle' ?
                'ring-amber-500/70' :
                r.status === 'violation' ?
                'ring-red-500/70' :
                'ring-[#6B6258]/40';
                return (
                  <button
                    key={r.id}
                    onClick={() => handleRiderClick(r.id)}
                    className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[#FAFAF7] transition ${focusRiderId === r.id ? 'bg-[#FFF1E0]' : ''}`}>
                    
                      <img
                      src={r.avatar}
                      alt=""
                      className={`w-7 h-7 rounded-full bg-white ring-2 ${ring}`} />
                    
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[#1A1410] font-semibold truncate">
                          {r.name}
                        </div>
                        <div className="text-[10px] text-[#6B6258] font-mono">
                          {z?.name} · {relativeTime(r.lastPing, now)}
                        </div>
                      </div>
                    </button>);

              })}
              </div>
            </>
          }
        </aside>

        {/* Map */}
        <main className="flex-1 flex flex-col relative bg-[#FAFAF7] overflow-hidden">
          {/* === Live Map (hidden when route fullscreen) === */}
          <AnimatePresence initial={false}>
            {!isRouteFullscreen && (
              <motion.div
                key="main-map"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                className="relative p-3 w-full overflow-hidden flex-1 flex flex-col min-h-0"
              >
                <LiveMonitoringMap
                  riders={filtered}
                  zones={zones}
                  focusRiderId={focusRiderId}
                  onMarkerClick={handleRiderClick}
                />

                {focused && (
                  <div className="absolute top-6 right-6 w-72 z-[1100] max-h-[calc(100%-3rem)] overflow-y-auto bg-white/95 backdrop-blur-md border border-[#EFEAE2] rounded-xl p-4 shadow-2xl ar-slide-in custom-scrollbar">
                    <div className="flex items-center gap-3 mb-3">
                      <img
                        src={focused.avatar}
                        alt=""
                        className="w-12 h-12 rounded-full bg-[#FAFAF7] border border-[#EFEAE2] ring-2 ring-[#db6c00]/15"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[#1A1410] truncate">
                          {focused.name}
                        </div>
                        <div className="text-[11px] text-[#6B6258] font-mono">
                          {focused.riderCode}
                        </div>
                      </div>
                      <button
                        onClick={() => setFocusRiderId(null)}
                        className="text-[#6B6258] hover:text-[#1A1410] text-xs"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <Row label="Zone" value={focusedZone?.name ?? '—'} />
                      <Row
                        label="Status"
                        value={
                          <span className={`capitalize font-semibold ${focused.status === 'active' ? 'text-emerald-600' : focused.status === 'idle' ? 'text-amber-600' : focused.status === 'violation' ? 'text-red-600' : 'text-[#6B6258]'}`}>
                            {focused.status}
                          </span>
                        }
                      />
                      <Row label="Coords" mono value={`${focused.lat.toFixed(5)}, ${focused.lng.toFixed(5)}`} />
                      <Row label="Speed" mono value={`${Math.round(focused.speed)} km/h`} />
                      <Row label="Last ping" mono value={relativeTime(focused.lastPing, now)} />
                    </div>
                    <div className="mt-3 pt-3 border-t border-[#EFEAE2] grid grid-cols-3 gap-1.5">
                      <ActionBtn icon={MessageSquare} label="Message" />
                      <ActionBtn icon={Phone} label="Call" />
                      <ActionBtn icon={Flag} label="Flag" tone="red" />
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* === Route Trail Drawer === */}
          <AnimatePresence>
            {routeDrawerOpen && selectedRiderRoute.length > 1 && (
              <motion.div
                key="route-drawer"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                className={`border-t border-[#EFEAE2] p-4 bg-white flex flex-col overflow-hidden z-[500] min-h-0 transition-[flex] duration-300 ease-in-out ${
                  isRouteFullscreen ? 'flex-1' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <h3 className="text-sm font-semibold text-[#1A1410]">
                    Rider Route Trail — Today
                  </h3>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setIsRouteFullscreen(!isRouteFullscreen)}
                      className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-[#F5F0E8] text-[#db6c00] rounded hover:bg-[#db6c00]/10 transition-colors"
                    >
                      {isRouteFullscreen ? 'Minimize' : 'Fullscreen'}
                    </button>
                    <button
                      onClick={() => {
                        setRouteDrawerOpen(false);
                        setIsRouteFullscreen(false);
                      }}
                      className="text-xs text-[#888] hover:text-[#1A1410] transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 relative flex flex-col">
                  <RouteTrailMap
                    points={selectedRiderRoute}
                    stats={selectedRiderStats}
                    riderName={focused?.name ?? ''}
                    zoneName={focusedZone?.name ?? ''}
                    mapHeight={isRouteFullscreen ? '100%' : '220px'}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <EventTicker riders={riders} zones={zones} violations={violations} />
    </div>);

}
function FilterRow({
  label,
  value,
  onChange,
  options








}: {label: string;value: string;onChange: (v: string) => void;options: {v: string;l: string;}[];}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
        {label}
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((o) =>
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`px-2 py-1 rounded text-[11px] border font-semibold transition ${value === o.v ? 'bg-[#FFF1E0] border-[#db6c00]/40 text-[#b85a00]' : 'bg-white border-[#EFEAE2] text-[#6B6258] hover:text-[#1A1410] hover:border-[#db6c00]/30'}`}>
          
            {o.l}
          </button>
        )}
      </div>
    </div>);

}
function Row({
  label,
  value,
  mono




}: {label: string;value: React.ReactNode;mono?: boolean;}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 border-b border-[#EFEAE2]/70 last:border-0">
      <span className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold">
        {label}
      </span>
      <span
        className={`text-[#1A1410] ${mono ? 'font-mono text-[11px] tabular-nums' : 'font-semibold'}`}>
        
        {value}
      </span>
    </div>);

}
function ActionBtn({
  icon: Icon,
  label,
  tone






}: {icon: ComponentType<{className?: string;}>;label: string;tone?: 'red';}) {
  return (
    <button
      className={`flex flex-col items-center gap-1 py-2 rounded-md border text-[10px] font-semibold transition ${tone === 'red' ? 'bg-red-50 border-red-500/30 text-red-700 hover:bg-red-100' : 'bg-white border-[#EFEAE2] text-[#1A1410] hover:border-[#db6c00]/30 hover:text-[#db6c00]'}`}>
      
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>);

}