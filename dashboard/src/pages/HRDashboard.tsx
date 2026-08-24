import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, ClipboardCheck, UserX, AlertCircle } from 'lucide-react';
import { StatCard } from '../components/common/StatCard';
import { useRealtimeLocation } from '../hooks/useRealtimeLocation';
import { getZones } from '../services/geofencing/geofenceService';
import { getAttendanceLogs, getHrTodayKpis, deriveHrStatus, getLocalDateString } from '../services/attendance/attendanceService';
import type { Zone, AttendanceLog } from '../services/types';
import { QuickReportShortcuts, type QuickReportKey } from '../components/hr/QuickReportShortcuts';
import { HRAttendanceOverview } from '../components/hr/HRAttendanceOverview';
import { RiderStatusGrid } from '../components/hr/RiderStatusGrid';
import { HRViolationSummary } from '../components/hr/HRViolationSummary';
import { HRDetailsPanel } from '../components/hr/HRDetailsPanels';
import { NeedsAttention } from '../components/hr/NeedsAttention';
import { useAttendanceRealtimeVersion } from '../context/attendanceRealtimeContext';

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
  const [attendanceList, setAttendanceList] = useState<AttendanceLog[]>([]);
  const [activeSummaryPanel, setActiveSummaryPanel] = useState<'on_duty' | 'complete' | 'absent' | 'pending' | null>(null);
  const attendanceRealtimeVersion = useAttendanceRealtimeVersion();

  useEffect(() => {
    getZones().then(setZonesList);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([getHrTodayKpis(), getAttendanceLogs()]).then(([nextKpis, logs]) => {
      if (!active) return;
      setKpis(nextKpis);
      setAttendanceList(logs);
    });
    return () => { active = false; };
  }, [attendanceRealtimeVersion]);

  const today = getLocalDateString();
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

  const lateCount = useMemo(() => todayLogs.filter((l) => deriveHrStatus(l) === 'Late').length, [todayLogs]);

  function handleQuickReport(key: QuickReportKey) {
    onNavigate('reports', { preset: key });
  }

  function handleRiderClick(riderId: string) {
    onNavigate('monitoring', { rider: riderId });
  }

  return (
    <div className="dashboard-page space-y-5">
      {/* 1. Refined KPI Cards */}
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

      {/* 2. Needs Attention Priority Section */}
      <NeedsAttention
        attendanceLogs={attendanceList}
        violations={violations}
        onNavigate={onNavigate}
      />

      {/* 3. Quick Actions / Report Shortcuts */}
      <QuickReportShortcuts onSelect={handleQuickReport} />

      {/* 4. Attendance Overview Table */}
      <HRAttendanceOverview logs={attendanceList} zones={zonesList} />

      {/* 5. Rider Status Cards Grid */}
      <RiderStatusGrid
        riders={riders}
        zones={zonesList}
        todayLogs={todayLogs}
        onSelectRider={handleRiderClick}
      />

      {/* 6. Recent Violation Summary */}
      <div className="grid grid-cols-1">
        <HRViolationSummary
          violations={violations}
          riders={riders}
          onViewAll={() => onNavigate('monitoring')}
        />
      </div>
    </div>
  );
}
