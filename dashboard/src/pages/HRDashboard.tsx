import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, ClipboardCheck, UserX, AlertCircle } from 'lucide-react';
import { StatCard } from '../components/common/StatCard';
import { useRealtimeLocation } from '../hooks/useRealtimeLocation';
import { getZones } from '../services/geofencing/geofenceService';
import { getLocalDateString } from '../services/attendance/attendanceService';
import { getPresentationCompletionState, getPresentationStatus, listAttendanceContext, type AttendancePresentationLog } from '../services/attendance/attendanceContextService';
import type { RiderStatus, Zone } from '../services/types';
import { summarizeFleet } from '../lib/fleetRollup';
import { QuickReportShortcuts, type QuickReportKey } from '../components/hr/QuickReportShortcuts';
import { HRAttendanceOverview } from '../components/hr/HRAttendanceOverview';
import { HRLiveFleetTable } from '../components/hr/HRLiveFleetTable';
import { FleetRollupPanel } from '../components/fleet/FleetRollupPanel';
import { HRViolationSummary } from '../components/hr/HRViolationSummary';
import { HRDetailsPanel } from '../components/hr/HRDetailsPanels';
import { NeedsAttention } from '../components/hr/NeedsAttention';
import { useAttendanceContextVersion } from '../hooks/useAttendanceContextVersion';

interface HRDashboardProps {
  onNavigate: (page: 'monitoring' | 'attendance' | 'reports', params?: Record<string, string>) => void;
}

export function HRDashboard({ onNavigate }: HRDashboardProps) {
  const { riders, violations } = useRealtimeLocation();
  const [kpis, setKpis] = useState({
    onDuty: 0,
    complete: 0,
    absent: 0,
    pending: 0
  });
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [attendanceList, setAttendanceList] = useState<AttendancePresentationLog[]>([]);
  const [activeSummaryPanel, setActiveSummaryPanel] = useState<'on_duty' | 'complete' | 'absent' | 'pending' | null>(null);
  const [workspaceView, setWorkspaceView] = useState<'ledger' | 'fleet'>('ledger');
  const [zoneId, setZoneId] = useState('all');
  const [search, setSearch] = useState('');
  const [fleetStatus, setFleetStatus] = useState<RiderStatus | null>(null);
  const attendanceRealtimeVersion = useAttendanceContextVersion();
  const today = getLocalDateString();

  useEffect(() => {
    getZones().then(setZonesList);
  }, []);

  const fleetSummary = useMemo(() => summarizeFleet(riders, zonesList), [riders, zonesList]);

  useEffect(() => {
    let active = true;
    const fromDate = new Date(`${today}T00:00:00.000Z`);
    fromDate.setUTCDate(fromDate.getUTCDate() - 7);
    void listAttendanceContext({ fromDate: fromDate.toISOString().slice(0, 10), toDate: today }).then((logs) => {
      if (!active) return;
      const todayLogs = logs.filter(log => log.date === today);
      setKpis({
        onDuty: todayLogs.filter(log => getPresentationStatus(log) === 'present' || getPresentationStatus(log) === 'late').length,
        complete: todayLogs.filter(log => getPresentationCompletionState(log) === 'complete').length,
        absent: todayLogs.filter(log => getPresentationStatus(log) === 'absent').length,
        pending: todayLogs.filter(log => log.source === 'manual' || (Boolean(log.timeIn) && !log.timeOut)).length,
      });
      setAttendanceList(logs);
    });
    return () => { active = false; };
  }, [attendanceRealtimeVersion, today]);

  const yesterday = useMemo(() => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, [today]);

  const todayLogs = useMemo(() => attendanceList.filter((l) => l.date === today), [attendanceList, today]);
  const yesterdayLogs = useMemo(() => attendanceList.filter((l) => l.date === yesterday), [attendanceList, yesterday]);

  const onDutyTrend = useMemo(() => {
    if (yesterdayLogs.length === 0) return undefined;
    const yesterdayOnDuty = yesterdayLogs.filter((l) => l.status === 'present' || l.status === 'late').length;
    const delta = kpis.onDuty - yesterdayOnDuty;
    return {
      direction: delta > 0 ? ('up' as const) : delta < 0 ? ('down' as const) : ('flat' as const),
      value: `${delta >= 0 ? '+' : ''}${delta} vs yesterday`,
    };
  }, [kpis.onDuty, yesterdayLogs]);

  const completeTrend = useMemo(() => {
    if (yesterdayLogs.length === 0) return undefined;
    const yesterdayComplete = yesterdayLogs.filter((l) => l.timeIn && l.timeOut).length;
    const delta = kpis.complete - yesterdayComplete;
    return {
      direction: delta > 0 ? ('up' as const) : delta < 0 ? ('down' as const) : ('flat' as const),
      value: `${delta >= 0 ? '+' : ''}${delta} vs yesterday`,
    };
  }, [kpis.complete, yesterdayLogs]);

  const absentTrend = useMemo(() => {
    if (yesterdayLogs.length === 0) return undefined;
    const yesterdayAbsent = yesterdayLogs.filter((l) => l.status === 'absent').length;
    const delta = kpis.absent - yesterdayAbsent;
    return {
      direction: delta > 0 ? ('up' as const) : delta < 0 ? ('down' as const) : ('flat' as const),
      value: `${delta >= 0 ? '+' : ''}${delta} vs yesterday`,
      positive: false,
    };
  }, [kpis.absent, yesterdayLogs]);

  const lateCount = useMemo(() => todayLogs.filter((l) => getPresentationStatus(l) === 'late').length, [todayLogs]);

  function handleQuickReport(key: QuickReportKey) {
    onNavigate('reports', { preset: key });
  }

  function handleRiderClick(riderId: string) {
    onNavigate('monitoring', { rider: riderId });
  }

  function handleFleetStatusSelect(status: RiderStatus | null) {
    setFleetStatus(status);
    if (status) setWorkspaceView('fleet');
  }

  return (
    <div className="dashboard-page space-y-5">
      {/* 1. Command Header: Primary Shift KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Riders On Duty"
          value={
            <>
              <span className="text-foreground">{kpis.onDuty}</span>
              <span className="text-subtle-text text-xl"> / {riders.length}</span>
            </>
          }
          sub="Click to view time-in records →"
          icon={BadgeCheck}
          accent="blue"
          pulse
          onClick={() => setActiveSummaryPanel((prev) => (prev === 'on_duty' ? null : 'on_duty'))}
          trend={onDutyTrend}
        />

        <StatCard
          label="Complete Attendance"
          value={kpis.complete}
          sub="Click to view time-in + time-out →"
          icon={ClipboardCheck}
          accent="green"
          onClick={() => setActiveSummaryPanel((prev) => (prev === 'complete' ? null : 'complete'))}
          trend={completeTrend}
        />

        <StatCard
          label="Absent / No Time-In"
          value={kpis.absent}
          sub={kpis.absent > 0 ? 'Needs follow-up →' : 'All accounted for'}
          icon={UserX}
          accent="red"
          onClick={() => setActiveSummaryPanel((prev) => (prev === 'absent' ? null : 'absent'))}
          trend={absentTrend}
        />

        <StatCard
          label="Pending Validation"
          value={kpis.pending}
          sub={`${lateCount} late · click to review →`}
          icon={AlertCircle}
          accent="amber"
          onClick={() => setActiveSummaryPanel((prev) => (prev === 'pending' ? null : 'pending'))}
        />
      </div>

      {/* Expanding Inline Details Panel */}
      {activeSummaryPanel && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300">
          <HRDetailsPanel
            type={activeSummaryPanel}
            onClose={() => setActiveSummaryPanel(null)}
            logs={todayLogs}
            riders={riders}
          />
        </div>
      )}

      {/* 2. Priority Exception & Action Triage Bar */}
      <NeedsAttention
        attendanceLogs={attendanceList}
        violations={violations}
        onNavigate={onNavigate}
      />

      {/* 3. Core Operational Workspace (2-Column Asymmetric Canvas) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Primary Workstage: one roster at a time, always paginated */}
        <section className="lg:col-span-7 xl:col-span-8 space-y-3 min-w-0" aria-label="Workforce roster">
          <div className="inline-flex p-0.5 rounded-md bg-panel-bg border border-border" role="tablist" aria-label="Workforce view">
            {([
              { key: 'ledger', label: 'Attendance Ledger' },
              { key: 'fleet', label: 'Live Fleet' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={workspaceView === tab.key}
                onClick={() => setWorkspaceView(tab.key)}
                className={`px-3 py-1.5 text-xs rounded font-semibold transition cursor-pointer ${
                  workspaceView === tab.key ? 'bg-white text-primary shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {workspaceView === 'ledger' ? (
            <HRAttendanceOverview
              logs={attendanceList}
              zones={zonesList}
              zoneId={zoneId}
              onZoneIdChange={setZoneId}
              search={search}
              onSearchChange={setSearch}
            />
          ) : (
            <HRLiveFleetTable
              riders={riders}
              zones={zonesList}
              todayLogs={todayLogs}
              zoneId={zoneId}
              onZoneClear={() => setZoneId('all')}
              search={search}
              onSearchChange={setSearch}
              status={fleetStatus}
              onStatusChange={setFleetStatus}
              onSelectRider={handleRiderClick}
            />
          )}
        </section>

        {/* Right Rail: fleet counts that filter the roster, then exceptions and reports */}
        <aside className="lg:col-span-5 xl:col-span-4 space-y-5" aria-label="Workforce Telemetry and Actions">
          <FleetRollupPanel
            summary={fleetSummary}
            activeStatus={fleetStatus}
            onStatusSelect={handleFleetStatusSelect}
            activeZoneId={zoneId === 'all' ? null : zoneId}
            onZoneSelect={(id) => setZoneId(id ?? 'all')}
          />

          <HRViolationSummary
            violations={violations}
            riders={riders}
            onViewAll={() => onNavigate('monitoring')}
          />

          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-1 font-mono">
              Quick Reports & Exports
            </div>
            <QuickReportShortcuts onSelect={handleQuickReport} layout="stack" />
          </div>
        </aside>
      </div>
    </div>
  );
}
