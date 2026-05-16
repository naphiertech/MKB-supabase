import { useState } from 'react';
import {
  Users as UsersIcon,
  BadgeCheck,
  AlertTriangle,
  TrendingUp } from
'lucide-react';
import { useRealtimeLocation } from '../hooks/useRealtimeLocation';
import { zones, attendanceLogs } from '../services/mockData';
import { StatCard } from '../components/common/StatCard';
import { LiveMonitoringMap } from '../components/maps/LiveMonitoringMap';
import { OnlineRiders } from '../components/monitoring/OnlineRiders';
import { AttendanceLogs } from '../components/attendance/AttendanceLogs';
import { ViolationFeed } from '../components/monitoring/ViolationFeed';
import {
  markAllViolationsRead,
  markViolationRead } from
'../services/monitoringService';
interface AdminDashboardProps {
  onNavigate: (page: 'monitoring' | 'attendance') => void;
}
export function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const { riders, violations } = useRealtimeLocation();
  const [focusRiderId, setFocusRiderId] = useState<string | null>(null);
  const [, force] = useState(0);
  const activeCount = riders.filter((r) => r.status !== 'offline').length;
  const violationCount = riders.filter((r) => r.status === 'violation').length;
  const today = new Date().toISOString().slice(0, 10);
  const todayLogs = attendanceLogs.filter((l) => l.date === today);
  const presentToday = todayLogs.filter(
    (l) => l.status === 'present' || l.status === 'late'
  ).length;
  const attendanceRate = todayLogs.length ?
  Math.round(presentToday / todayLogs.length * 100) :
  0;
  function handleViewViolation(riderId: string) {
    setFocusRiderId(riderId);
    const v = violations.find((x) => x.riderId === riderId);
    if (v) {
      markViolationRead(v.id);
      force((n) => n + 1);
    }
  }
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      {/* Top stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Active Riders"
          value={
          <>
              <span className="text-[#1A1410]">{activeCount}</span>
              <span className="text-[#6B6258] text-xl"> / {riders.length}</span>
            </>
          }
          sub={`${riders.length - activeCount} offline`}
          icon={UsersIcon}
          accent="blue"
          trend={{
            direction: 'up',
            value: '+2 vs yesterday'
          }}
          spark={[4, 6, 5, 7, 8, 7, 9, 10, 9, 11, 12]} />
        
        <StatCard
          label="On Duty Today"
          value={presentToday}
          sub="+2 since 6:00 AM"
          icon={BadgeCheck}
          accent="green"
          pulse
          trend={{
            direction: 'up',
            value: '+18% wow'
          }}
          spark={[3, 5, 4, 6, 8, 7, 9]} />
        
        <StatCard
          label="Geofence Violations"
          value={violationCount}
          sub={violationCount > 0 ? 'Action required' : 'All clear'}
          icon={AlertTriangle}
          accent="red"
          trend={{
            direction: violationCount > 0 ? 'up' : 'flat',
            value: violationCount > 0 ? '+1 in last hour' : 'no change',
            positive: false
          }}
          spark={[1, 2, 1, 3, 2, 4, 2, 3, 1, 2, 3]} />
        
        <StatCard
          label="Attendance Rate"
          value={
          <>
              {attendanceRate}
              <span className="text-[#6B6258] text-xl">%</span>
            </>
          }
          sub="Target ≥ 92%"
          icon={TrendingUp}
          accent="amber"
          trend={{
            direction: 'up',
            value: '+2.3% vs yesterday'
          }}
          spark={[6, 7, 5, 8, 9, 8, 9, 10]} />
        
      </div>

      {/* Map + Online Riders */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <div className="bg-white border border-[#EFEAE2] rounded-xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#EFEAE2]">
              <div>
                <div className="text-sm font-semibold text-[#1A1410]">
                  Live Rider Map
                </div>
                <div className="text-[11px] text-[#6B6258] font-mono">
                  Zamboanga City · 5 geofenced zones
                </div>
              </div>
              <button
                onClick={() => onNavigate('monitoring')}
                className="text-xs text-[#db6c00] hover:text-[#b85a00] font-semibold">
                
                Open full view →
              </button>
            </div>
            <div className="h-[460px]">
              <LiveMonitoringMap
                riders={riders}
                zones={zones}
                focusRiderId={focusRiderId}
                onMarkerClick={setFocusRiderId} />
              
            </div>
          </div>
        </div>
        <div className="lg:col-span-2">
          <OnlineRiders
            riders={riders}
            zones={zones}
            onSelectRider={setFocusRiderId} />
          
        </div>
      </div>

      {/* Attendance Logs + Violation Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <AttendanceLogs
            logs={attendanceLogs}
            onViewAll={() => onNavigate('attendance')} />
          
        </div>
        <div className="lg:col-span-2">
          <ViolationFeed
            alerts={violations}
            onView={handleViewViolation}
            onMarkAllRead={() => {
              markAllViolationsRead();
              force((n) => n + 1);
            }} />
          
        </div>
      </div>
    </div>);

}