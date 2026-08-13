import { useEffect, useState } from 'react';
import { BadgeCheck, ClipboardCheck, UserX, AlertCircle } from 'lucide-react';
import { StatCard } from '../components/common/StatCard';
import { useRealtimeLocation } from '../hooks/useRealtimeLocation';
import { getZones } from '../services/geofenceService';
import { getAttendanceLogs, getHrTodayKpis, deriveHrStatus, getLocalDateString } from '../services/attendanceService';
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
  const todayLogs = attendanceList.filter((l) => l.date === today);
  const lateCount = todayLogs.filter((l) => deriveHrStatus(l) === 'Late').length;

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
          trend={{ direction: 'up', value: '+3 vs yesterday' }}
          spark={[5, 6, 7, 6, 8, 9, 9, 10, 11]}
        />

        <StatCard
          label="Complete Attendance"
          value={kpis.complete}
          sub="Click to view time-in + time-out →"
          icon={ClipboardCheck}
          accent="green"
          onClick={() => setActiveSummaryPanel((prev) => (prev === 'complete' ? null : 'complete'))}
          trend={{ direction: 'up', value: `+${Math.max(1, kpis.complete - 4)} today` }}
          spark={[3, 4, 5, 6, 7, 8, 9]}
        />

        <StatCard
          label="Absent / No Time-In"
          value={kpis.absent}
          sub={kpis.absent > 0 ? 'Needs follow-up →' : 'All accounted for'}
          icon={UserX}
          accent="red"
          onClick={() => setActiveSummaryPanel((prev) => (prev === 'absent' ? null : 'absent'))}
          trend={{
            direction: kpis.absent > 0 ? 'up' : 'flat',
            value: kpis.absent > 0 ? `${kpis.absent} today` : 'no change',
            positive: false
          }}
          spark={[2, 3, 2, 4, 3, 2, 3]}
        />

        <StatCard
          label="Pending Validation"
          value={kpis.pending}
          sub={`${lateCount} late · click to review →`}
          icon={AlertCircle}
          accent="amber"
          onClick={() => setActiveSummaryPanel((prev) => (prev === 'pending' ? null : 'pending'))}
          trend={{ direction: 'flat', value: 'awaiting review' }}
          spark={[4, 5, 4, 6, 5, 4, 5]}
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
