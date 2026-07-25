import { useEffect, useState, useMemo } from 'react';
import { Clock, ArrowLeft, Calendar, Hourglass, Activity, AlertCircle, Filter, ArrowUpDown } from 'lucide-react';
import { fetchRiderDashboardWithSWR, type CachedDashboardPayload } from '../services/riderCacheService';
import { DashboardSkeleton } from '../components/common/DashboardSkeleton';
import type { Rider, AttendancePresence, PunctualityStatus } from '../services/types';

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

/**
 * Format YYYY-MM-DD date string safely without UTC timezone shift offsets.
 */
function formatDateLabel(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-').map(Number);
    if (parts.length < 3) return dateStr;
    const [year, month, day] = parts;
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

interface DBAttendanceLog {
  id: string;
  date: string;
  status: 'present' | 'late' | 'on_leave' | 'absent';
  hours: number | null;
  time_in: string | null;
  time_out: string | null;
  presence?: AttendancePresence;
  punctuality?: PunctualityStatus;
}

export function RiderAttendance({ userId, onBack }: RiderAttendanceProps) {
  const riderId = userId.replace(/^u-rider-/, '');
  const [rider, setRider] = useState<Rider | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthLogs, setMonthLogs] = useState<DBAttendanceLog[]>([]);
  const [todayLog, setTodayLog] = useState<{ timeIn: string | null; timeOut: string | null } | null>(null);
  const [elapsed, setElapsed] = useState('0h 00m');

  // Filter & Sort States
  const [monthFilter, setMonthFilter] = useState<'current' | 'all'>('current');
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'present' | 'absent' | 'on_leave'>('all');
  const [punctualityFilter, setPunctualityFilter] = useState<'all' | 'on_time' | 'late'>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

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
            const typedLogs = (monthAtt as DBAttendanceLog[]).map(l => {
              const isLate = l.status === 'late';
              const isPresent = !!l.time_in || l.status === 'present' || isLate;
              const presence: AttendancePresence = l.status === 'on_leave' ? 'on_leave' : isPresent ? 'present' : 'absent';
              const punctuality: PunctualityStatus = isLate ? 'late' : isPresent ? 'on_time' : 'none';
              return { ...l, presence, punctuality };
            });

            for (const log of typedLogs) {
              if (log.presence === 'present') {
                presentCount++;
              }
              if (log.date >= firstDayOfWeekStr) {
                weekHours += (log.hours || 0);
              }
            }
            setMonthLogs(typedLogs);
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

  // Filtered and Sorted Logs
  const filteredLogs = useMemo(() => {
    let logs = [...monthLogs];

    if (attendanceFilter !== 'all') {
      logs = logs.filter((log) => {
        const p = log.presence || (log.status === 'on_leave' ? 'on_leave' : log.time_in ? 'present' : 'absent');
        return p === attendanceFilter;
      });
    }

    if (punctualityFilter !== 'all') {
      logs = logs.filter((log) => {
        const p = log.punctuality || (log.status === 'late' ? 'late' : log.time_in ? 'on_time' : 'none');
        return p === punctualityFilter;
      });
    }

    logs.sort((a, b) => {
      const keyA = `${a.date}T${a.time_in || '00:00'}`;
      const keyB = `${b.date}T${b.time_in || '00:00'}`;
      return sortOrder === 'desc'
        ? keyB.localeCompare(keyA)
        : keyA.localeCompare(keyB);
    });

    return logs;
  }, [monthLogs, attendanceFilter, punctualityFilter, sortOrder]);

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-[#EFEAE2]/60">
          <div>
            <h2 className="text-[#1A1410] font-semibold text-base">
              Attendance Log History
            </h2>
            <p className="text-xs text-[#6B6258] mt-0.5">
              Your detailed attendance checks for the current month.
            </p>
          </div>

          {/* Controls: Filter & Sort */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative inline-flex items-center">
              <Calendar className="w-3.5 h-3.5 absolute left-2.5 text-[#6B6258] pointer-events-none" />
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value as typeof monthFilter)}
                className="h-8 pl-8 pr-7 text-xs rounded-lg border border-[#EFEAE2] bg-[#FAFAF7] text-[#1A1410] font-medium focus:outline-none focus:ring-1 focus:ring-[#db6c00] appearance-none cursor-pointer"
              >
                <option value="current">Current Month</option>
                <option value="all">All Months</option>
              </select>
            </div>

            <div className="relative inline-flex items-center">
              <Filter className="w-3.5 h-3.5 absolute left-2.5 text-[#6B6258] pointer-events-none" />
              <select
                value={attendanceFilter}
                onChange={(e) => setAttendanceFilter(e.target.value as typeof attendanceFilter)}
                className="h-8 pl-8 pr-7 text-xs rounded-lg border border-[#EFEAE2] bg-[#FAFAF7] text-[#1A1410] font-medium focus:outline-none focus:ring-1 focus:ring-[#db6c00] appearance-none cursor-pointer"
              >
                <option value="all">All Attendance</option>
                <option value="present">Present Only</option>
                <option value="absent">Absent Only</option>
                <option value="on_leave">On Leave</option>
              </select>
            </div>

            <div className="relative inline-flex items-center">
              <Clock className="w-3.5 h-3.5 absolute left-2.5 text-[#6B6258] pointer-events-none" />
              <select
                value={punctualityFilter}
                onChange={(e) => setPunctualityFilter(e.target.value as typeof punctualityFilter)}
                className="h-8 pl-8 pr-7 text-xs rounded-lg border border-[#EFEAE2] bg-[#FAFAF7] text-[#1A1410] font-medium focus:outline-none focus:ring-1 focus:ring-[#db6c00] appearance-none cursor-pointer"
              >
                <option value="all">All Punctuality</option>
                <option value="on_time">On Time Only</option>
                <option value="late">Late Only</option>
              </select>
            </div>

            <div className="relative inline-flex items-center">
              <ArrowUpDown className="w-3.5 h-3.5 absolute left-2.5 text-[#6B6258] pointer-events-none" />
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
                className="h-8 pl-8 pr-7 text-xs rounded-lg border border-[#EFEAE2] bg-[#FAFAF7] text-[#1A1410] font-medium focus:outline-none focus:ring-1 focus:ring-[#db6c00] appearance-none cursor-pointer"
              >
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </select>
            </div>
          </div>
        </div>

        {/* Counter Header */}
        {monthLogs.length > 0 && (
          <div className="text-[11px] font-mono text-[#6B6258] uppercase tracking-wider">
            Showing {filteredLogs.length} of {monthLogs.length} records
          </div>
        )}

        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-[#EFEAE2] rounded-xl space-y-2">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-50 text-amber-600">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-[#1A1410]">No Matching Records</h3>
            <p className="text-xs text-[#6B6258] max-w-xs mx-auto">
              No attendance logs match your selected filter criteria. Try clearing filters to view all records.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#EFEAE2] border border-[#EFEAE2] rounded-xl overflow-hidden bg-white">
            {filteredLogs.map((log, index) => {
              const isLate = log.status === 'late' || log.punctuality === 'late';
              const isPresent = !!log.time_in || log.status === 'present' || isLate;
              const isAbsent = log.status === 'absent' && !isPresent;
              const isLeave = log.status === 'on_leave';

              const dateLabel = formatDateLabel(log.date);

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
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* Primary Attendance Presence Badge */}
                    {isPresent && (
                      <span className="px-2 py-0.5 rounded-md border text-xs font-medium uppercase tracking-wider bg-emerald-50 text-emerald-700 border-emerald-200/50">
                        Present
                      </span>
                    )}
                    {isAbsent && (
                      <span className="px-2 py-0.5 rounded-md border text-xs font-medium uppercase tracking-wider bg-red-50 text-red-700 border-red-200/50">
                        Absent
                      </span>
                    )}
                    {isLeave && (
                      <span className="px-2 py-0.5 rounded-md border text-xs font-medium uppercase tracking-wider bg-blue-50 text-blue-700 border-blue-200/50">
                        On Leave
                      </span>
                    )}

                    {/* Secondary Punctuality Indicator Tag */}
                    {isLate && (
                      <span className="px-2 py-0.5 rounded-md border text-xs font-medium uppercase tracking-wider bg-amber-50 text-amber-700 border-amber-200/50">
                        Late Arrival
                      </span>
                    )}

                    <span className="font-semibold font-mono text-sm text-[#1A1410] ml-1">
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
