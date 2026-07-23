import { useEffect, useState } from 'react';
import { Clock, ArrowLeft, Calendar, Hourglass, Activity, AlertCircle } from 'lucide-react';
import { fetchRiderDashboardWithSWR, type CachedDashboardPayload } from '../services/riderCacheService';
import { DashboardSkeleton } from '../components/common/DashboardSkeleton';
import type { Rider } from '../services/types';

interface RiderAttendanceProps {
  userId: string;
  onBack: () => void;
}

function toHHMM(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const formatted = dateStr.includes(' ') && !dateStr.includes('T')
      ? dateStr.replace(' ', 'T')
      : dateStr;
    const d = new Date(formatted);
    if (isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

function format12h(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = (h + 11) % 12 + 1;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function getLocalDateString(d: Date = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface DBAttendanceLog {
  id: string;
  date: string;
  status: 'present' | 'late' | 'on_leave' | 'absent';
  hours: number | null;
  time_in: string | null;
  time_out: string | null;
}

export function RiderAttendance({ userId, onBack }: RiderAttendanceProps) {
  const riderId = userId.replace(/^u-rider-/, '');
  const [rider, setRider] = useState<Rider | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthLogs, setMonthLogs] = useState<DBAttendanceLog[]>([]);
  const [todayLog, setTodayLog] = useState<{ timeIn: string | null; timeOut: string | null } | null>(null);
  const [elapsed, setElapsed] = useState('0h 00m');

  const [stats, setStats] = useState({
    daysPresent: 0,
    hoursThisWeek: 0,
    attendanceRate: 0,
  });

  useEffect(() => {
    async function loadData() {
      try {
        const todayStr = getLocalDateString();
        const todayDate = new Date();
        const firstDayOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
        const firstDayStr = getLocalDateString(firstDayOfMonth);

        const dayOfWeek = todayDate.getDay();
        const diff = todayDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const firstDayOfWeek = new Date(todayDate.setDate(diff));
        const firstDayOfWeekStr = getLocalDateString(firstDayOfWeek);

        const applyPayload = (payload: CachedDashboardPayload) => {
          const { dbRider, todayAttendance: attLog, monthAttendance: monthAtt } = payload;
          if (dbRider) {
            const mappedRider: Rider = {
              id: dbRider.id,
              name: dbRider.name,
              avatar: dbRider.face_image_url || dbRider.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(dbRider.name)}`,
              zoneId: dbRider.zone_id,
              status: dbRider.status,
              lat: dbRider.lat || 0,
              lng: dbRider.lng || 0,
              speed: dbRider.speed || 0,
              shift: (dbRider.shift || 'Morning').toLowerCase() as 'morning' | 'afternoon' | 'evening',
              lastPing: dbRider.last_ping ? new Date(dbRider.last_ping).getTime() : 0,
              phone: dbRider.contact || '',
              riderCode: dbRider.mkb_id
            };
            setRider(mappedRider);
          }

          if (attLog) {
            setTodayLog({
              timeIn: attLog.time_in ? toHHMM(attLog.time_in) : null,
              timeOut: attLog.time_out ? toHHMM(attLog.time_out) : null,
            });
          }

          let presentCount = 0;
          let weekHours = 0;

          if (monthAtt) {
            const typedLogs = monthAtt as { status: string; date: string; hours: number | null }[];
            for (const log of typedLogs) {
              if (log.status === 'present' || log.status === 'late') {
                presentCount++;
              }
              if (log.date >= firstDayOfWeekStr) {
                weekHours += (log.hours || 0);
              }
            }
            setMonthLogs(monthAtt as DBAttendanceLog[]);
          }

          const totalDaysSoFar = Math.max(1, todayDate.getDate());
          const rate = Math.round((presentCount / totalDaysSoFar) * 100);

          setStats({
            daysPresent: presentCount,
            hoursThisWeek: Number(weekHours.toFixed(1)),
            attendanceRate: Math.min(100, rate),
          });

          setLoading(false);
        };

        await fetchRiderDashboardWithSWR(
          userId,
          riderId,
          todayStr,
          firstDayStr,
          firstDayOfMonth.toISOString(),
          {
            onCacheLoaded: applyPayload,
            onFreshDataLoaded: applyPayload
          }
        );
      } catch (err) {
        console.error('Error loading rider attendance data:', err);
        setLoading(false);
      }
    }

    loadData();
  }, [userId, riderId]);

  // Live Duty Timer
  useEffect(() => {
    if (!todayLog?.timeIn || todayLog?.timeOut) return;
    const [h, m] = todayLog.timeIn.split(':').map(Number);
    const start = new Date();
    start.setHours(h, m, 0, 0);

    const updateTimer = () => {
      let diff = Math.max(0, Date.now() - start.getTime());
      const hours = Math.floor(diff / 3600000);
      diff -= hours * 3600000;
      const mins = Math.floor(diff / 60000);
      setElapsed(`${hours}h ${String(mins).padStart(2, '0')}m`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, [todayLog]);

  if (loading || !rider) {
    return <DashboardSkeleton page="attendance" role="rider" />;
  }

  const isClockedIn = todayLog?.timeIn && !todayLog?.timeOut;

  return (
    <div className="p-4 md:p-6 lg:p-7 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-[#6B6258] hover:text-[#1A1410] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </button>
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#6B6258] font-mono font-semibold">
          Attendance Portal
        </div>
      </div>

      {/* Active duty session banner */}
      {isClockedIn && todayLog?.timeIn && (
        <div className="relative rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-50 to-white p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-emerald-500/5 blur-xl pointer-events-none" />
          <div className="flex items-start gap-3">
            <span className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 mt-0.5 ring-1 ring-emerald-500/20 shrink-0">
              <span className="absolute w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
              <Clock className="w-5 h-5 relative z-10" />
            </span>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                Active Duty Session
              </div>
              <div className="text-sm text-emerald-800/80 font-mono mt-0.5">
                Clocked in at {format12h(todayLog.timeIn)}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-5">
            <div className="text-right sm:pr-2">
              <div className="text-[10px] uppercase tracking-wider text-[#6B6258] font-mono font-semibold">
                Duration Elapsed
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-emerald-800">
                {elapsed}
              </div>
            </div>
            <button
              onClick={onBack}
              className="h-10 px-4 rounded-md bg-[#db6c00] hover:bg-[#b85a00] text-white text-xs font-semibold tracking-wider uppercase transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-[#db6c00]/25"
            >
              Clock Out
            </button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[#EFEAE2] bg-white p-4 shadow-sm flex items-center gap-3.5">
          <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/20 shrink-0">
            <Calendar className="w-5 h-5" />
          </span>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#6B6258] font-mono font-semibold">
              Days Present
            </div>
            <div className="text-xl font-bold text-[#1A1410] mt-0.5 font-mono">
              {stats.daysPresent} days
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#EFEAE2] bg-white p-4 shadow-sm flex items-center gap-3.5">
          <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#FFF1E0] text-[#db6c00] ring-1 ring-[#db6c00]/20 shrink-0">
            <Hourglass className="w-5 h-5" />
          </span>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#6B6258] font-mono font-semibold">
              Attendance Rate
            </div>
            <div className="text-xl font-bold text-[#1A1410] mt-0.5 font-mono">
              {stats.attendanceRate}%
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#EFEAE2] bg-white p-4 shadow-sm flex items-center gap-3.5">
          <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-500/20 shrink-0">
            <Activity className="w-5 h-5" />
          </span>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#6B6258] font-mono font-semibold">
              Hours This Week
            </div>
            <div className="text-xl font-bold text-[#1A1410] mt-0.5 font-mono">
              {stats.hoursThisWeek.toFixed(1)} hrs
            </div>
          </div>
        </div>
      </div>

      {/* History Log */}
      <section className="rounded-2xl border border-[#EFEAE2] bg-white p-5 sm:p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-[#1A1410] font-semibold text-base">
            Attendance Log History
          </h2>
          <p className="text-xs text-[#6B6258] mt-0.5">
            Your detailed attendance checks for the current month.
          </p>
        </div>

        {monthLogs.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-[#EFEAE2] rounded-xl space-y-2">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-50 text-amber-600">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-[#1A1410]">No Records</h3>
            <p className="text-xs text-[#6B6258] max-w-xs mx-auto">
              No clock-in logs found for the current billing cycle. Clock in from the home dashboard to get started.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#EFEAE2] border border-[#EFEAE2] rounded-xl overflow-hidden bg-white">
            {monthLogs.map((log, index) => {
              const isLate = log.status === 'late';
              const isPresent = log.status === 'present';
              const isAbsent = log.status === 'absent';
              const isLeave = log.status === 'on_leave';

              let badgeClass = 'bg-gray-50 text-gray-700 border-gray-200';
              let badgeText: string = log.status;
              if (isPresent) {
                badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200/50';
                badgeText = 'Present';
              } else if (isLate) {
                badgeClass = 'bg-amber-50 text-amber-700 border-amber-200/50';
                badgeText = 'Late';
              } else if (isAbsent) {
                badgeClass = 'bg-red-50 text-red-700 border-red-200/50';
                badgeText = 'Absent';
              } else if (isLeave) {
                badgeClass = 'bg-blue-50 text-blue-700 border-blue-200/50';
                badgeText = 'On Leave';
              }

              const d = new Date(log.date);
              const dateLabel = d.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              });

              return (
                <div
                  key={log.id || index}
                  className="p-3.5 flex items-center justify-between text-sm hover:bg-[#FAFAF7] transition-colors"
                >
                  <div>
                    <div className="font-semibold text-[#1A1410]">{dateLabel}</div>
                    <div className="text-xs text-[#6B6258] font-mono mt-0.5">
                      {log.time_in ? format12h(toHHMM(log.time_in) || '00:00') : '—'} –{' '}
                      {log.time_out ? format12h(toHHMM(log.time_out) || '00:00') : '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded-md border text-xs font-medium uppercase tracking-wider ${badgeClass}`}
                    >
                      {badgeText}
                    </span>
                    <span className="font-semibold font-mono text-sm text-[#1A1410]">
                      {log.hours ? `${log.hours.toFixed(1)} hrs` : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
