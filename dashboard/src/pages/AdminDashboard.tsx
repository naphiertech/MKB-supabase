import { useEffect, useMemo, useState } from "react";
import {
  Users as UsersIcon,
  BadgeCheck,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { useRealtimeLocation } from "../hooks/useRealtimeLocation";
import { getZones } from "../services/geofencing/geofenceService";
import {
  getAttendanceLogs,
  getLocalDateString,
} from "../services/attendance/attendanceService";
import type { Zone, AttendanceLog } from "../services/types";
import { StatCard } from "../components/common/StatCard";
import { LiveMonitoringMap } from "../components/maps/LiveMonitoringMap";
import { OnlineRiders } from "../components/monitoring/OnlineRiders";
import { AttendanceLogs } from "../components/attendance/AttendanceLogs";
import { ViolationFeed } from "../components/monitoring/ViolationFeed";
import {
  markAllViolationsRead,
  markViolationRead,
} from "../services/monitoring/monitoringService";
import { StatDetailsPanel } from "../components/dashboard/StatDetailsPanels";
import { useAttendanceRealtimeVersion } from "../context/attendanceRealtimeContext";

interface AdminDashboardProps {
  onNavigate: (page: "monitoring" | "attendance") => void;
}

export function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const { riders, violations, markLocalViolationRead, markAllLocalViolationsRead } = useRealtimeLocation();
  const [focusRiderId, setFocusRiderId] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<"active_riders" | "on_duty" | "violations" | "attendance" | null>(null);
  const activeCount = riders.filter((r) => r.status !== "offline").length;
  const violationCount = riders.filter((r) => r.status === "violation").length;
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [attendanceList, setAttendanceList] = useState<AttendanceLog[]>([]);
  const attendanceRealtimeVersion = useAttendanceRealtimeVersion();

  useEffect(() => {
    getZones().then(setZonesList);
  }, []);

  useEffect(() => {
    let active = true;
    void getAttendanceLogs().then((logs) => {
      if (active) setAttendanceList(logs);
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

  const presentToday = useMemo(
    () => todayLogs.filter((l) => l.status === "present" || l.status === "late").length,
    [todayLogs]
  );
  const yesterdayPresent = useMemo(
    () => yesterdayLogs.filter((l) => l.status === "present" || l.status === "late").length,
    [yesterdayLogs]
  );

  const attendanceRate = useMemo(
    () => (todayLogs.length ? Math.round((presentToday / todayLogs.length) * 100) : 0),
    [todayLogs.length, presentToday]
  );
  const yesterdayRate = useMemo(
    () => (yesterdayLogs.length ? Math.round((yesterdayPresent / yesterdayLogs.length) * 100) : null),
    [yesterdayLogs.length, yesterdayPresent]
  );

  const onDutyTrend = useMemo(() => {
    if (yesterdayLogs.length === 0) return undefined;
    const delta = presentToday - yesterdayPresent;
    return {
      direction: delta > 0 ? ('up' as const) : delta < 0 ? ('down' as const) : ('flat' as const),
      value: `${delta >= 0 ? '+' : ''}${delta} vs yesterday`,
    };
  }, [presentToday, yesterdayPresent, yesterdayLogs.length]);

  const attendanceRateTrend = useMemo(() => {
    if (yesterdayRate === null || todayLogs.length === 0) return undefined;
    const delta = attendanceRate - yesterdayRate;
    return {
      direction: delta > 0 ? ('up' as const) : delta < 0 ? ('down' as const) : ('flat' as const),
      value: `${delta >= 0 ? '+' : ''}${delta}% vs yesterday`,
    };
  }, [attendanceRate, yesterdayRate, todayLogs.length]);

  function handleViewViolation(riderId: string) {
    setFocusRiderId(riderId);
    const v = violations.find((x) => x.riderId === riderId);
    if (v) {
      markLocalViolationRead(v.id);
      markViolationRead(v.id).catch(err => console.error("Failed to mark violation read:", err));
    }
  }
  return (
    <div className="dashboard-page space-y-5">
      {/* Top stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Active Riders"
          value={
            <>
              <span className="text-foreground">{activeCount}</span>
              <span className="text-muted-foreground text-xl"> / {riders.length}</span>
            </>
          }
          sub={`${riders.length - activeCount} offline`}
          icon={UsersIcon}
          accent="blue"
          onClick={() => setActiveModal((prev) => (prev === "active_riders" ? null : "active_riders"))}
        />

        <StatCard
          label="On Duty Today"
          value={presentToday}
          sub="Click to view details →"
          icon={BadgeCheck}
          accent="green"
          pulse
          onClick={() => setActiveModal((prev) => (prev === "on_duty" ? null : "on_duty"))}
          trend={onDutyTrend}
        />

        <StatCard
          label="Geofence Violations"
          value={violationCount}
          sub={violationCount > 0 ? "Action required" : "All clear"}
          icon={AlertTriangle}
          accent="red"
          onClick={() => setActiveModal((prev) => (prev === "violations" ? null : "violations"))}
        />

        <StatCard
          label="Attendance Rate"
          value={
            <>
              {attendanceRate}
              <span className="text-muted-foreground text-xl">%</span>
            </>
          }
          sub="Target ≥ 92%"
          icon={TrendingUp}
          accent="amber"
          onClick={() => setActiveModal((prev) => (prev === "attendance" ? null : "attendance"))}
          trend={attendanceRateTrend}
        />
      </div>

      {/* Expanding Inline Details Panel */}
      {activeModal && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300">
          <StatDetailsPanel
            type={activeModal}
            onClose={() => setActiveModal(null)}
            riders={riders}
            zones={zonesList}
            logs={todayLogs}
            violations={violations}
            onViewViolation={handleViewViolation}
            attendanceList={attendanceList}
          />
        </div>
      )}

      {/* Map + Online Riders */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Live Rider Map
                </div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  Zamboanga City · 5 geofenced zones
                </div>
              </div>
              <button
                onClick={() => onNavigate("monitoring")}
                className="text-xs text-primary hover:text-accent-foreground font-semibold"
              >
                Open full view →
              </button>
            </div>
            <div className="h-[340px] sm:h-[400px] lg:h-[460px]">
              <LiveMonitoringMap
                riders={riders}
                zones={zonesList}
                focusRiderId={focusRiderId}
                onMarkerClick={setFocusRiderId}
              />
            </div>
          </div>
        </div>
        <div className="lg:col-span-2">
          <OnlineRiders
            riders={riders}
            zones={zonesList}
            onSelectRider={setFocusRiderId}
          />
        </div>
      </div>

      {/* Attendance Logs + Violation Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <AttendanceLogs
            logs={attendanceList}
            onViewAll={() => onNavigate("attendance")}
          />
        </div>
        <div className="lg:col-span-2">
          <ViolationFeed
            alerts={violations}
            onView={handleViewViolation}
            onMarkAllRead={() => {
              markAllLocalViolationsRead();
              markAllViolationsRead().catch(err => console.error("Failed to mark all read:", err));
            }}
          />
        </div>
      </div>
    </div>
  );
}
