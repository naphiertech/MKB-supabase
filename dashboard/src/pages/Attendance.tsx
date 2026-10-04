import { useEffect, useState, useMemo } from 'react';
import {
  BadgeCheck,
  Clock,
  UserMinus,
  PalmtreeIcon,
  Printer,
  FileText,
  Download,
  Search,
  RotateCcw,
  FileEdit
} from 'lucide-react';
import {
  getAttendanceLogs,
  getLocalDateString,
  isPresentAttendance,
  matchesAttendanceStatusFilter,
} from '../services/attendance/attendanceService';
import {
  listAttendanceContext,
  mergeAttendanceContextDetails,
  type AttendanceContextLog,
} from '../services/attendance/attendanceContextService';
import { getZones } from '../services/geofencing/geofenceService';
import type { Zone, AttendanceLog } from '../services/types';
import { StatCard } from '../components/common/StatCard';
import { AttendanceTable } from '../components/attendance/AttendanceTable';
import { getRidersLookup } from '../services/riders/riderService';
import { AttendanceDetailsPanel } from '../components/attendance/AttendanceDetailsPanels';
import { AttendanceCorrectionDrawer } from '../components/attendance/AttendanceCorrectionDrawer';
import { AttendanceAuditHistoryDrawer } from '../components/attendance/AttendanceAuditHistoryDrawer';
import { appToast } from '../hooks/useToast';
import { exportEmployeeDTR } from '../lib/exports/employeeExport';
import { exportAttendanceCsv, exportAttendancePdf } from '../lib/exports/attendanceExport';
import type { EmploymentStatus } from '../services/types';
import { useAttendanceContextVersion } from '../hooks/useAttendanceContextVersion';

type QuickRange = 'today' | 'this_week' | 'this_cutoff' | 'this_month' | 'custom';

function getQuickRangeDates(type: QuickRange): { from: string; to: string } {
  const now = new Date();
  const todayStr = getLocalDateString(now);

  switch (type) {
    case 'today':
      return { from: todayStr, to: todayStr };
    case 'this_week': {
      const day = now.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: getLocalDateString(monday), to: getLocalDateString(sunday) };
    }
    case 'this_cutoff': {
      const year = now.getFullYear();
      const month = now.getMonth();
      const mStr = String(month + 1).padStart(2, '0');
      if (now.getDate() <= 15) {
        return { from: `${year}-${mStr}-01`, to: `${year}-${mStr}-15` };
      } else {
        const lastDay = new Date(year, month + 1, 0).getDate();
        return { from: `${year}-${mStr}-16`, to: `${year}-${mStr}-${String(lastDay).padStart(2, '0')}` };
      }
    }
    case 'this_month': {
      const year = now.getFullYear();
      const month = now.getMonth();
      const mStr = String(month + 1).padStart(2, '0');
      const lastDay = new Date(year, month + 1, 0).getDate();
      return { from: `${year}-${mStr}-01`, to: `${year}-${mStr}-${String(lastDay).padStart(2, '0')}` };
    }
    default:
      return { from: todayStr, to: todayStr };
  }
}

export function Attendance() {
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('present');
  const [punctualityFilter, setPunctualityFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const today = getLocalDateString();
  const sevenDaysAgo = getLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const [dateFrom, setDateFrom] = useState<string>(today);
  const [dateTo, setDateTo] = useState<string>(today);
  const [activeQuickRange, setActiveQuickRange] = useState<QuickRange>('today');

  const [attendanceList, setAttendanceList] = useState<AttendanceContextLog[]>([]);
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [activeSummaryModal, setActiveSummaryModal] = useState<'present' | 'late' | 'absent' | 'on_leave' | null>(null);

  // DTR states
  const [dtrModalOpen, setDtrModalOpen] = useState(false);
  const [dtrRiderId, setDtrRiderId] = useState('');
  const [dtrDateFrom, setDtrDateFrom] = useState<string>(sevenDaysAgo);
  const [ridersList, setRidersList] = useState<{
    id: string;
    name: string;
    mkb_id?: string;
    zone_id?: string;
    zoneName?: string;
    employmentStatus: EmploymentStatus;
    archiveEffectiveDate: string | null;
    restoredAt: string | null;
  }[]>([]);

  const attendanceRealtimeVersion = useAttendanceContextVersion();

  // Authoritative Attendance Correction & Audit states
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [correctionTargetLog, setCorrectionTargetLog] = useState<{
    id?: string;
    riderId: string;
    riderName?: string;
    date: string;
    timeIn?: string | null;
    timeOut?: string | null;
    status?: string | null;
    source?: string | null;
    zoneName?: string | null;
  } | null>(null);

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyTargetLog, setHistoryTargetLog] = useState<{
    id?: string;
    riderId: string;
    riderName?: string;
    date: string;
  } | null>(null);

  useEffect(() => {
    getZones().then(setZonesList);

    // Fetch riders for DTR picker
    getRidersLookup({ scope: 'historical' })
      .then((data) => {
        setRidersList(
          data.map(
            (r: {
              id: string;
              name: string;
              mkb_id?: string;
              zone_id?: string;
              zones?: { name: string } | { name: string }[] | null;
              employmentStatus: EmploymentStatus;
              archiveEffectiveDate: string | null;
              restoredAt: string | null;
            }) => {
              const zName = Array.isArray(r.zones) ? r.zones[0]?.name : r.zones?.name;
              return {
                id: r.id,
                name: r.name,
                mkb_id: r.mkb_id,
                zone_id: r.zone_id || '',
                zoneName: zName || 'Zamboanga City',
                employmentStatus: r.employmentStatus,
                archiveEffectiveDate: r.archiveEffectiveDate,
                restoredAt: r.restoredAt,
              };
            }
          )
        );
      })
      .catch((error) => {
        console.error('Error fetching riders:', error);
        appToast.error('Failed to load riders list');
      });
  }, []);

  useEffect(() => {
    let active = true;
    const previousDate = new Date(`${dateFrom}T00:00:00.000Z`);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);
    const contextFrom = dateFrom === dateTo ? previousDate.toISOString().slice(0, 10) : dateFrom;

    void Promise.all([
      listAttendanceContext({ fromDate: contextFrom, toDate: dateTo }),
      getAttendanceLogs(
        { dateFrom: contextFrom, dateTo },
        { finalizeDaily: false, throwOnError: true, includeEvents: true },
      ),
    ]).then(([contextRows, rawRows]) => {
      if (active) setAttendanceList(mergeAttendanceContextDetails(contextRows, rawRows));
    }).catch((error) => {
      if (active) console.error('Error fetching attendance context:', error);
    });

    return () => { active = false; };
  }, [attendanceRealtimeVersion, dateFrom, dateTo]);

  const fullAttendanceList = attendanceList;

  const kpiLogs = useMemo(() => {
    const targetDate = dateFrom === dateTo ? dateFrom : today;
    return fullAttendanceList.filter((l) => {
      const isDateMatch = l.date === targetDate;
      const isZoneMatch = zoneFilter === 'all' || l.zoneId === zoneFilter;
      return isDateMatch && isZoneMatch;
    });
  }, [fullAttendanceList, today, dateFrom, dateTo, zoneFilter]);

  const kpis = useMemo(() => {
    return {
      present: kpiLogs.filter(isPresentAttendance).length,
      late: kpiLogs.filter((l) => l.status === 'late' || l.punctuality === 'late').length,
      absent: kpiLogs.filter((l) => !isPresentAttendance(l) && l.status === 'absent').length,
      onLeave: kpiLogs.filter((l) => !isPresentAttendance(l) && l.status === 'on_leave').length
    };
  }, [kpiLogs]);

  const previousDate = useMemo(() => {
    const targetDate = dateFrom === dateTo ? dateFrom : today;
    const d = new Date(`${targetDate}T00:00:00`);
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, [dateFrom, dateTo, today]);

  const prevKpiLogs = useMemo(() => {
    return fullAttendanceList.filter((l) => {
      const isDateMatch = l.date === previousDate;
      const isZoneMatch = zoneFilter === 'all' || l.zoneId === zoneFilter;
      return isDateMatch && isZoneMatch;
    });
  }, [fullAttendanceList, previousDate, zoneFilter]);

  const presentTrend = useMemo(() => {
    if (prevKpiLogs.length === 0) return undefined;
    const prevCount = prevKpiLogs.filter(isPresentAttendance).length;
    const delta = kpis.present - prevCount;
    return {
      direction: delta > 0 ? ('up' as const) : delta < 0 ? ('down' as const) : ('flat' as const),
      value: `${delta >= 0 ? '+' : ''}${delta} vs yesterday`,
    };
  }, [kpis.present, prevKpiLogs]);

  const lateTrend = useMemo(() => {
    if (prevKpiLogs.length === 0) return undefined;
    const prevCount = prevKpiLogs.filter((l) => l.status === 'late').length;
    const delta = kpis.late - prevCount;
    return {
      direction: delta > 0 ? ('up' as const) : delta < 0 ? ('down' as const) : ('flat' as const),
      value: `${delta >= 0 ? '+' : ''}${delta} vs yesterday`,
      positive: delta <= 0,
    };
  }, [kpis.late, prevKpiLogs]);

  const absentTrend = useMemo(() => {
    if (prevKpiLogs.length === 0) return undefined;
    const prevCount = prevKpiLogs.filter((l) => l.status === 'absent').length;
    const delta = kpis.absent - prevCount;
    return {
      direction: delta > 0 ? ('up' as const) : delta < 0 ? ('down' as const) : ('flat' as const),
      value: `${delta >= 0 ? '+' : ''}${delta} vs yesterday`,
      positive: false,
    };
  }, [kpis.absent, prevKpiLogs]);

  const filtered = useMemo(() => {
    return fullAttendanceList.filter((l) => {
      const isStatusMatch = matchesAttendanceStatusFilter(l, statusFilter);
      const isPunctualityMatch = punctualityFilter === 'all' || l.punctuality === punctualityFilter;

      return (
        l.date >= dateFrom &&
        l.date <= dateTo &&
        (zoneFilter === 'all' || l.zoneId === zoneFilter) &&
        isStatusMatch &&
        isPunctualityMatch &&
        (searchQuery === '' ||
          l.riderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.riderId.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    });
  }, [fullAttendanceList, dateFrom, dateTo, zoneFilter, statusFilter, punctualityFilter, searchQuery]);

  const isFilterModified = useMemo(() => {
    return (
      zoneFilter !== 'all' ||
      statusFilter !== 'present' ||
      punctualityFilter !== 'all' ||
      searchQuery !== '' ||
      activeQuickRange !== 'today' ||
      dateFrom !== today ||
      dateTo !== today
    );
  }, [zoneFilter, statusFilter, punctualityFilter, searchQuery, activeQuickRange, dateFrom, dateTo, today]);

  const handleApplyQuickRange = (range: QuickRange) => {
    setActiveQuickRange(range);
    const dates = getQuickRangeDates(range);
    setDateFrom(dates.from);
    setDateTo(dates.to);
  };

  const handleResetFilters = () => {
    setDateFrom(today);
    setDateTo(today);
    setZoneFilter('all');
    setStatusFilter('present');
    setPunctualityFilter('all');
    setSearchQuery('');
    setActiveQuickRange('today');
  };

  const handleExportCSV = () => {
    exportAttendanceCsv(filtered, { from: dateFrom, to: dateTo });
  };

  const handleExportPDF = () => {
    exportAttendancePdf(filtered, { from: dateFrom, to: dateTo });
  };

  const handleDownloadDTR = async (riderId: string) => {
    const selectedDtrRider = ridersList.find((r) => r.id === riderId);
    if (!selectedDtrRider) return;

    const riderZone = selectedDtrRider.zoneName || 'Zamboanga City';
    const monthStart = `${dtrDateFrom.slice(0, 7)}-01`;
    const monthEndDate = new Date(`${monthStart}T00:00:00.000Z`);
    monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1);
    monthEndDate.setUTCDate(0);
    const monthEnd = monthEndDate.toISOString().slice(0, 10);

    try {
      const riderLogs = await listAttendanceContext({ fromDate: monthStart, toDate: monthEnd, riderId });
      exportEmployeeDTR({
        riderName: selectedDtrRider.name,
        riderRole: 'RIDER',
        zoneName: riderZone,
        calendarDate: new Date(`${monthStart}T00:00:00.000Z`),
        logs: riderLogs,
      });
    } catch (error) {
      console.error('Failed to load Attendance context for DTR:', error);
      appToast.error('Unable to load Attendance context for this DTR.');
    }
  };

  const refreshAttendance = () => {
    const previousDate = new Date(`${dateFrom}T00:00:00.000Z`);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);
    const contextFrom = dateFrom === dateTo ? previousDate.toISOString().slice(0, 10) : dateFrom;

    void Promise.all([
      listAttendanceContext({ fromDate: contextFrom, toDate: dateTo }),
      getAttendanceLogs(
        { dateFrom: contextFrom, dateTo },
        { finalizeDaily: false, throwOnError: true, includeEvents: true },
      ),
    ]).then(([contextRows, rawRows]) => {
      setAttendanceList(mergeAttendanceContextDetails(contextRows, rawRows));
    }).catch((error) => {
      console.error('Error refreshing attendance context:', error);
    });
  };

  const handleOpenCorrection = (log?: AttendanceLog | AttendanceContextLog) => {
    if (log) {
      setCorrectionTargetLog({
        id: log.id || undefined,
        riderId: log.riderId,
        riderName: log.riderName,
        date: log.date,
        timeIn: log.timeIn,
        timeOut: log.timeOut,
        status: log.status,
        source: log.source,
        zoneName: log.zoneName,
      });
    } else {
      setCorrectionTargetLog(null);
    }
    setCorrectionModalOpen(true);
  };

  const handleOpenHistory = (log: AttendanceLog | AttendanceContextLog) => {
    setHistoryTargetLog({
      id: log.id || undefined,
      riderId: log.riderId,
      riderName: log.riderName,
      date: log.date,
    });
    setHistoryModalOpen(true);
  };

  return (
    <div className="dashboard-page space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Present Today"
          value={kpis.present}
          icon={BadgeCheck}
          accent="green"
          pulse
          onClick={() => setActiveSummaryModal((prev) => (prev === 'present' ? null : 'present'))}
          trend={presentTrend}
        />

        <StatCard
          label="Late Today"
          value={kpis.late}
          icon={Clock}
          accent="amber"
          onClick={() => setActiveSummaryModal((prev) => (prev === 'late' ? null : 'late'))}
          trend={lateTrend}
        />

        <StatCard
          label="Absent"
          value={kpis.absent}
          icon={UserMinus}
          accent="red"
          onClick={() => setActiveSummaryModal((prev) => (prev === 'absent' ? null : 'absent'))}
          trend={absentTrend}
        />

        <StatCard
          label="On Leave"
          value={kpis.onLeave}
          icon={PalmtreeIcon}
          accent="blue"
          onClick={() => setActiveSummaryModal((prev) => (prev === 'on_leave' ? null : 'on_leave'))}
        />
      </div>

      {/* Expanding Inline Details Panel */}
      {activeSummaryModal && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300">
          <AttendanceDetailsPanel
            type={activeSummaryModal}
            onClose={() => setActiveSummaryModal(null)}
            logs={kpiLogs}
          />
        </div>
      )}

      {/* Enhanced Filter & Action Toolbar */}
      <div className="bg-white border border-border rounded-xl p-4 md:p-5 shadow-sm space-y-4">
        {/* Quick Date Presets Row */}
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase font-bold tracking-[0.14em] text-muted-foreground mr-1">
              DATE PRESETS:
            </span>
            {(['today', 'this_week', 'this_cutoff', 'this_month'] as const).map((rKey) => {
              const labels: Record<string, string> = {
                today: 'Today',
                this_week: 'This Week',
                this_cutoff: 'This Cutoff',
                this_month: 'This Month'
              };
              const isActive = activeQuickRange === rKey;
              return (
                <button
                  key={rKey}
                  onClick={() => handleApplyQuickRange(rKey)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-primary text-white border border-primary shadow-2xs'
                      : 'bg-panel-bg text-muted-foreground hover:text-foreground border border-border hover:bg-white'
                  }`}
                >
                  {labels[rKey]}
                </button>
              );
            })}
          </div>

          {/* Reset Filters Button */}
          <button
            disabled={!isFilterModified}
            onClick={handleResetFilters}
            className={`text-xs font-semibold transition flex items-center gap-1.5 ${
              isFilterModified
                ? 'text-primary hover:text-accent-foreground cursor-pointer opacity-100'
                : 'text-muted-foreground opacity-40 cursor-not-allowed'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Filters</span>
          </button>
        </div>

        {/* Toolbar Controls Row */}
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
          {/* Left Filters Section */}
          <div className="flex w-full flex-wrap items-end gap-3.5 xl:flex-1">
            <FilterField label="From">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setActiveQuickRange('custom');
                }}
                className="att-input"
              />
            </FilterField>

            <FilterField label="To">
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setActiveQuickRange('custom');
                }}
                className="att-input"
              />
            </FilterField>

            <FilterField label="Zone">
              <select
                value={zoneFilter}
                onChange={(e) => setZoneFilter(e.target.value)}
                className="att-input"
              >
                <option value="all">All Zones</option>
                {zonesList.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Status">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="att-input"
              >
                <option value="all">All Statuses</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="on_leave">On Leave</option>
              </select>
            </FilterField>

            <FilterField label="Punctuality">
              <select
                value={punctualityFilter}
                onChange={(e) => setPunctualityFilter(e.target.value)}
                className="att-input"
              >
                <option value="all">All Punctuality</option>
                <option value="on_time">On Time</option>
                <option value="late">Late</option>
              </select>
            </FilterField>

            <FilterField label="Search Rider">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 pointer-events-none z-10" />
                <input
                  type="text"
                  placeholder="Search by Rider Name or Rider ID"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="att-input w-full sm:w-64 md:w-72"
                  style={{ paddingLeft: '32px' }}
                />
              </div>
            </FilterField>
          </div>

          {/* Right Actions Section */}
          <div className="grid w-full grid-cols-2 items-end gap-2 border-t border-border pt-3 sm:flex sm:w-auto sm:flex-wrap xl:shrink-0 xl:border-t-0 xl:pt-0">
            {/* Export CSV Ghost */}
            <button
              onClick={handleExportCSV}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-muted-foreground transition hover:bg-panel-bg hover:text-foreground sm:h-[34px] sm:w-auto cursor-pointer"
              title="Export CSV"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>

            {/* Export PDF Ghost */}
            <button
              onClick={handleExportPDF}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-muted-foreground transition hover:bg-panel-bg hover:text-foreground sm:h-[34px] sm:w-auto cursor-pointer"
              title="Export PDF"
            >
              <FileText className="w-3.5 h-3.5" /> PDF
            </button>

            {/* Correct Attendance Secondary Outline */}
            <button
              onClick={() => handleOpenCorrection()}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-3.5 text-xs font-semibold text-foreground shadow-2xs transition hover:bg-panel-bg sm:h-[34px] sm:w-auto cursor-pointer"
            >
              <FileEdit className="w-3.5 h-3.5 text-primary" />
              <span>Correct Attendance</span>
            </button>

            {/* Generate DTR Primary */}
            <button
              onClick={() => setDtrModalOpen(true)}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold text-white shadow-sm transition hover:bg-primary-hover hover:shadow-md sm:h-[34px] sm:w-auto cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Generate DTR</span>
            </button>
          </div>
        </div>

        <style>{`
          .att-input {
            height: 34px;
            width: 100%;
            min-width: 0;
            padding: 0 10px;
            background: var(--panel-bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            color: var(--foreground);
            font-size: 12px;
            outline: none;
            font-family: 'Geist Mono', monospace;
            transition: border-color 150ms ease, box-shadow 150ms ease;
          }
          @media (min-width: 640px) {
            .att-input { width: auto; }
          }
          .att-input:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(219, 108, 0, 0.12);
          }
          select.att-input {
            appearance: none;
            padding-right: 28px;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B6258' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 10px center;
          }
          .att-input::-webkit-calendar-picker-indicator { opacity: 0.7; cursor: pointer; }
        `}</style>
      </div>

      <AttendanceTable
        logs={filtered}
        onCorrect={handleOpenCorrection}
        onViewHistory={handleOpenHistory}
      />

      {/* DTR Print Preview Modal */}
      {dtrModalOpen &&
        (() => {
          const selectedDtrRider = ridersList.find((r) => r.id === dtrRiderId);

          // Compute DTR dates for the entire month
          const dtrDays = (() => {
            if (!dtrDateFrom) return [];
            const start = new Date(dtrDateFrom);
            const year = start.getFullYear();
            const month = start.getMonth();

            const dates: { dayNum: number; dateString: string; displayDate: string }[] = [];
            for (let day = 1; day <= 31; day++) {
              const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              dates.push({
                dayNum: day,
                dateString,
                displayDate: `${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`
              });
            }
            return dates;
          })();

          return (
            <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4">
              <div className="viewport-dialog relative w-full max-w-2xl space-y-5 rounded-xl bg-white p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200 sm:rounded-2xl sm:p-6">
                <div className="flex justify-between items-center pb-3 border-b border-border">
                  <div>
                    <h3 className="text-base font-bold text-foreground">Generate Daily Time Record (DTR)</h3>
                    <p className="text-xs text-muted-foreground">
                      Select an employee and period to export an official DTR Form.
                    </p>
                  </div>
                  <button
                    onClick={() => setDtrModalOpen(false)}
                    className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-panel-bg"
                  >
                    <Printer className="w-5 h-5 opacity-0" /> {/* Spacer */}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FilterField label="Select Employee">
                    <select
                      value={dtrRiderId}
                      onChange={(e) => setDtrRiderId(e.target.value)}
                      className="att-input w-full"
                    >
                      <option value="">-- Choose Rider --</option>
                      {ridersList.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} {r.mkb_id ? `(${r.mkb_id})` : ''}
                        </option>
                      ))}
                    </select>
                  </FilterField>

                  <FilterField label="Month Period">
                    <input
                      type="date"
                      value={dtrDateFrom}
                      onChange={(e) => setDtrDateFrom(e.target.value)}
                      className="att-input w-full"
                    />
                  </FilterField>
                </div>

                {dtrRiderId && (
                  <div className="bg-panel-bg border border-border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs border-b border-border pb-2">
                      <span className="font-semibold text-foreground">Preview Information</span>
                      <span className="text-muted-foreground font-mono">{dtrDays.length} Days in Period</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>
                        Rider: <strong className="text-foreground">{selectedDtrRider?.name}</strong>
                      </div>
                      <div>
                        Zone: <strong className="text-foreground">{selectedDtrRider?.zoneName}</strong>
                      </div>
                      <div>
                        Role: <strong className="text-foreground">RIDER</strong>
                      </div>
                      <div>
                        Month: <strong className="text-foreground">{dtrDateFrom}</strong>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-3 border-t border-border">
                  <button
                    onClick={() => setDtrModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground rounded-lg hover:bg-panel-bg transition"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!dtrRiderId}
                    onClick={() => {
                      handleDownloadDTR(dtrRiderId);
                      setDtrModalOpen(false);
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition shadow-sm"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Download PDF DTR</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Attendance Correction Drawer */}
      <AttendanceCorrectionDrawer
        isOpen={correctionModalOpen}
        onClose={() => {
          setCorrectionModalOpen(false);
          setCorrectionTargetLog(null);
        }}
        onSuccess={refreshAttendance}
        initialLog={correctionTargetLog}
        ridersList={ridersList}
      />

      {/* Attendance Audit History Drawer */}
      <AttendanceAuditHistoryDrawer
        isOpen={historyModalOpen}
        onClose={() => {
          setHistoryModalOpen(false);
          setHistoryTargetLog(null);
        }}
        attendanceLogId={historyTargetLog?.id}
        riderId={historyTargetLog?.riderId}
        date={historyTargetLog?.date}
        riderName={historyTargetLog?.riderName}
      />
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-1 sm:w-auto">
      <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">{label}</label>
      {children}
    </div>
  );
}
