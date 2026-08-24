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
import { useRiderZone } from '../context/RiderZoneContext';
import { LiveMonitoringMap } from '../components/maps/LiveMonitoringMap';
import { EventTicker } from '../components/monitoring/EventTicker';
import { useNow, relativeTime } from '../hooks/useNow';
import { RouteTrailMap } from '../components/maps/RouteTrailMap';
import { Modal } from '../components/common/Modal';
import { pushToast } from '../hooks/useToast';
import { createLiveMonitoringManualFlag, phoneHref } from '../services/liveMonitoringActions';
import { 
  getRouteForRider, 
  computeRouteStats,
  RoutePoint,
  RouteStats
} from '../services/routeService';

export function LiveMonitoring() {
  const { riders, violations } = useRealtimeLocation();
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [focusRiderId, setFocusRiderId] = useState<string | null>(null);
  
  const [selectedRiderRoute, setSelectedRiderRoute] = useState<RoutePoint[]>([]);
  const [selectedRiderStats, setSelectedRiderStats] = useState<RouteStats | null>(null);
  const [routeDrawerOpen, setRouteDrawerOpen] = useState(false);
  const [isRouteFullscreen, setIsRouteFullscreen] = useState(false);
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [flagging, setFlagging] = useState(false);

  const { zones: zonesList } = useRiderZone();

  const now = useNow();
  const filtered = useMemo(() => {
    return riders.filter(
      (r) =>
      (zoneFilter === 'all' || r.zoneId === zoneFilter) && (
      statusFilter === 'all' || r.status === statusFilter)
    );
  }, [riders, zoneFilter, statusFilter]);
  const focused = riders.find((r) => r.id === focusRiderId);
  const focusedZone = focused ?
  zonesList.find((z) => z.id === focused.zoneId) :
  null;

  const handleRiderClick = async (riderId: string) => {
    setFocusRiderId(riderId);
    const points = await getRouteForRider(riderId);
    setSelectedRiderRoute(points);
    setSelectedRiderStats(computeRouteStats(points));
    setRouteDrawerOpen(true);
  };

  const handleQuickFlag = async () => {
    if (!focused) return;
    setFlagging(true);
    try {
      await createLiveMonitoringManualFlag({
        riderId: focused.id,
        riderName: focused.name,
        zoneId: focused.zoneId,
        zoneName: focusedZone?.name,
        lat: focused.lat,
        lng: focused.lng,
        reason: flagReason,
      });
      setFlagModalOpen(false);
      setFlagReason('');
      pushToast({ title: 'Rider flagged', description: `${focused.name} was added to the violation feed for follow-up.`, tone: 'success' });
    } catch (error: unknown) {
      pushToast({ title: 'Flag failed', description: error instanceof Error ? error.message : 'Could not flag this rider.', tone: 'error' });
    } finally {
      setFlagging(false);
    }
  };
  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[32rem] flex-col">
      <div className="flex-1 flex overflow-hidden">
        {/* Left rail */}
        <aside
          className={`${collapsed ? 'relative w-12' : 'absolute inset-y-0 left-0 z-[1150] w-80 max-w-[85vw] shadow-2xl xl:relative xl:z-auto xl:shadow-none'} shrink-0 bg-white border-r border-border transition-all flex flex-col`}>
          
          <div className="flex items-center justify-between p-3 border-b border-border">
            {!collapsed &&
            <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  Filters
                </span>
              </div>
            }
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="ui-icon-button h-9 w-9 border-0"
              aria-label="Toggle rail">
              
              {collapsed ?
              <ChevronRight className="w-4 h-4" /> :

              <ChevronLeft className="w-4 h-4" />
              }
            </button>
          </div>

          {!collapsed &&
          <>
              <div className="p-3 space-y-3 border-b border-border">
                <FilterRow
                label="Zone"
                value={zoneFilter}
                onChange={setZoneFilter}
                options={[
                {
                  v: 'all',
                  l: 'All Zones'
                },
                ...zonesList.map((z) => ({
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
              
              </div>

              <div className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-mono font-semibold">
                Riders · {filtered.length}
              </div>
              <div className="ar-scroll overflow-y-auto flex-1 px-2 pb-2 space-y-1">
                {filtered.map((r) => {
                const z = zonesList.find((z) => z.id === r.zoneId);
                const ring =
                r.status === 'active' ?
                'ring-emerald-500/70' :
                r.status === 'idle' ?
                'ring-amber-500/70' :
                r.status === 'violation' ?
                'ring-red-500/70' :
                'ring-muted-foreground/40';
                return (
                  <button
                    key={r.id}
                    onClick={() => handleRiderClick(r.id)}
                    className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-panel-bg transition cursor-pointer ${focusRiderId === r.id ? 'bg-accent' : ''}`}>
                    
                      <img
                      src={r.avatar}
                      alt=""
                      className={`w-7 h-7 rounded-full bg-white ring-2 ${ring}`} />
                    
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-foreground font-semibold truncate">
                          {r.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">
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
        <main className="flex-1 flex flex-col relative bg-panel-bg overflow-hidden">
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
                  zones={zonesList}
                  focusRiderId={focusRiderId}
                  onMarkerClick={handleRiderClick}
                />

                {focused && (
                  <div className="absolute top-3 left-3 right-3 z-[1100] max-h-[calc(100%-1.5rem)] overflow-y-auto bg-white/95 backdrop-blur-md border border-border rounded-xl p-4 shadow-2xl ar-slide-in custom-scrollbar md:top-6 md:left-auto md:right-6 md:w-72 md:max-h-[calc(100%-3rem)]">
                    <div className="flex items-center gap-3 mb-3">
                      <img
                        src={focused.avatar}
                        alt=""
                        className="w-12 h-12 rounded-full bg-panel-bg border border-border ring-2 ring-primary/15"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">
                          {focused.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {focused.riderCode}
                        </div>
                      </div>
                      <button
                        onClick={() => setFocusRiderId(null)}
                        className="text-muted-foreground hover:text-foreground text-xs cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <Row label="Zone" value={focusedZone?.name ?? '—'} />
                      <Row
                        label="Status"
                        value={
                          <span className={`capitalize font-semibold ${focused.status === 'active' ? 'text-emerald-600' : focused.status === 'idle' ? 'text-amber-600' : focused.status === 'violation' ? 'text-red-600' : 'text-muted-foreground'}`}>
                            {focused.status === 'offline' && (focused.lat !== 0 || focused.lng !== 0) ? 'Offline (Last Known)' : focused.status}
                          </span>
                        }
                      />
                      <Row
                        label={focused.status === 'offline' ? "Last Coords" : "Coords"}
                        mono
                        value={
                          focused.lat !== 0 || focused.lng !== 0
                            ? `${focused.lat.toFixed(5)}, ${focused.lng.toFixed(5)}`
                            : 'No location history'
                        }
                      />
                      <Row label="Speed" mono value={`${Math.round(focused.speed)} km/h`} />
                      <Row label="Last ping" mono value={focused.lastPing ? relativeTime(focused.lastPing, now) : 'Never'} />
                    </div>
                    {focused.lat === 0 && focused.lng === 0 && (
                      <div className="mt-2.5 p-2 bg-amber-50 border border-amber-200/60 rounded-lg text-[11px] text-amber-800 font-medium text-center">
                        No location history available.
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-1.5">
                      <ActionBtn icon={MessageSquare} label="Message" disabled unavailable />
                      <ActionBtn icon={Phone} label="Call" href={phoneHref(focused.phone) ?? undefined} disabled={!phoneHref(focused.phone)} title={!focused.phone ? 'No phone number is stored for this rider' : 'Open this device’s phone dialer'} />
                      <ActionBtn icon={Flag} label="Flag" tone="red" onClick={() => setFlagModalOpen(true)} />
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
                className={`border-t border-border p-4 bg-white flex flex-col overflow-hidden z-[500] min-h-0 transition-[flex] duration-300 ease-in-out ${
                  isRouteFullscreen ? 'flex-1' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <h3 className="text-sm font-semibold text-foreground">
                    Rider Route Trail — Today
                  </h3>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setIsRouteFullscreen(!isRouteFullscreen)}
                      className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-accent text-accent-foreground rounded hover:bg-primary/10 transition-colors cursor-pointer"
                    >
                      {isRouteFullscreen ? 'Minimize' : 'Fullscreen'}
                    </button>
                    <button
                      onClick={() => {
                        setRouteDrawerOpen(false);
                        setIsRouteFullscreen(false);
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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

      <EventTicker violations={violations} />
      <Modal open={flagModalOpen} onClose={() => !flagging && setFlagModalOpen(false)} dismissible={!flagging} title="Flag rider for follow-up?" subtitle={focused?.name}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">This creates a persisted <strong className="text-foreground">manual flag</strong> incident using the existing violations workflow. It does not change attendance or payroll records.</p>
          <div><label htmlFor="quick-flag-reason" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reason (optional)</label><textarea id="quick-flag-reason" value={flagReason} onChange={(event) => setFlagReason(event.target.value)} maxLength={500} rows={3} className="w-full resize-none rounded-lg border border-border p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" placeholder="Add context for Admin/HR follow-up" /></div>
          <div className="flex justify-end gap-2"><button type="button" disabled={flagging} onClick={() => setFlagModalOpen(false)} className="rounded-lg border border-border px-4 py-2 text-xs font-semibold disabled:opacity-60">Cancel</button><button type="button" disabled={flagging || !focused} onClick={() => void handleQuickFlag()} className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">{flagging ? 'Saving flag…' : 'Create manual flag'}</button></div>
        </div>
      </Modal>
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
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5 font-semibold">
        {label}
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((o) =>
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          aria-pressed={value === o.v}
          className={`px-2 py-1 rounded text-[11px] border font-semibold transition cursor-pointer ${value === o.v ? 'bg-accent border-primary/40 text-accent-foreground' : 'bg-white border-border text-muted-foreground hover:text-foreground hover:border-primary/30'}`}>
          
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
    <div className="flex items-center justify-between gap-3 py-1 border-b border-border/70 last:border-0">
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
        {label}
      </span>
      <span
        className={`text-foreground ${mono ? 'font-mono text-[11px] tabular-nums' : 'font-semibold'}`}>
        
        {value}
      </span>
    </div>);

}
function ActionBtn({
  icon: Icon,
  label,
  tone,
  href,
  onClick,
  disabled = false,
  unavailable = false,
  title
}: {icon: ComponentType<{className?: string;}>;label: string;tone?: 'red';href?: string;onClick?: () => void;disabled?: boolean;unavailable?: boolean;title?: string;}) {
  const className = `flex flex-col items-center gap-1 py-2 rounded-md border text-[10px] font-semibold transition ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:shadow-sm'} ${tone === 'red' ? 'bg-red-50 border-red-500/30 text-red-700' : 'bg-white border-border text-muted-foreground hover:text-primary'}`;
  const content = <><Icon className="w-3.5 h-3.5" />{label}{unavailable ? ' · Soon' : ''}</>;
  if (href && !disabled) return <a href={href} title={title} className={className}>{content}</a>;
  return <button type="button" disabled={disabled} onClick={onClick} title={title ?? (unavailable ? `${label} is not yet available` : label)} className={className}>{content}</button>;

}
