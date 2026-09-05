import { useEffect, useState, useMemo } from 'react';
import {
  BadgeCheck,
  Clock,
  UserMinus,
  PalmtreeIcon,
  Printer,
  FileText,
  Upload,
  Download,
  Search,
  RotateCcw
} from 'lucide-react';
import { getAttendanceLogs, getLocalDateString, isAttendanceFinalized } from '../services/attendance/attendanceService';
import { getZones } from '../services/geofencing/geofenceService';
import type { AttendanceLog, Zone } from '../services/types';
import { StatCard } from '../components/common/StatCard';
import { AttendanceTable } from '../components/attendance/AttendanceTable';
import { getRidersLookup } from '../services/riders/riderService';
import { AttendanceDetailsPanel } from '../components/attendance/AttendanceDetailsPanels';
import { parseDTRPdf, saveImportedLogs, ParsedDTRLog } from '../services/attendance/dtrParserService';
import { appToast } from '../hooks/useToast';
import { exportEmployeeDTR } from '../lib/exports/employeeExport';
import { exportAttendanceCsv, exportAttendancePdf } from '../lib/exports/attendanceExport';
import { getCachedAvatar } from '../lib/avatarCache';
import { isEmploymentActiveOnDate } from '../lib/workforce/employmentLifecycle';
import type { EmploymentStatus } from '../services/types';
import { useAttendanceRealtimeVersion } from '../context/attendanceRealtimeContext';

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

  const [attendanceList, setAttendanceList] = useState<AttendanceLog[]>([]);
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

  // DTR Import states
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsingStatus, setParsingStatus] = useState<string>('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedLogs, setParsedLogs] = useState<ParsedDTRLog[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const attendanceRealtimeVersion = useAttendanceRealtimeVersion();

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
    void getAttendanceLogs().then((logs) => {
      if (active) setAttendanceList(logs);
    });
    return () => { active = false; };
  }, [attendanceRealtimeVersion]);

  const fullAttendanceList = useMemo(() => {
    if (ridersList.length === 0) return attendanceList;

    // Existing log map: key = `${riderId}_${date}`
    const existingLogMap = new Set<string>();
    attendanceList.forEach((log) => {
      existingLogMap.add(`${log.riderId}_${log.date}`);
    });

    const effectiveTo = dateTo > today ? today : dateTo;
    const synthesizedAbsentLogs: AttendanceLog[] = [];

    if (dateFrom <= effectiveTo) {
      const curDate = new Date(dateFrom);
      const endDate = new Date(effectiveTo);

      while (curDate <= endDate) {
        const dateStr = getLocalDateString(curDate);
        // Only classify riders without Time In as Absent if the date/time is finalized (5:00 PM cutoff for today, or any past date)
        if (isAttendanceFinalized(dateStr, 17)) {
          ridersList.forEach((rider) => {
            if (!isEmploymentActiveOnDate(rider, dateStr)) return;
            const key = `${rider.id}_${dateStr}`;
            if (!existingLogMap.has(key)) {
              synthesizedAbsentLogs.push({
                id: `absent_${rider.id}_${dateStr}`,
                riderId: rider.id,
                riderName: rider.name,
                riderAvatar:
                  getCachedAvatar(rider.id) ||
                  `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(rider.name)}`,
                date: dateStr,
                timeIn: null,
                timeOut: null,
                rawTimeIn: null,
                rawTimeOut: null,
                hours: 0,
                zoneId: rider.zone_id || '',
                zoneName: rider.zoneName || 'Zamboanga City',
                status: 'absent',
                presence: 'absent',
                punctuality: 'none',
                source: 'system',
                notes: 'Auto-generated absent record by system cutoff (5:00 PM)',
                lat: 0,
                lng: 0,
                events: []
              });
            }
          });
        }
        curDate.setDate(curDate.getDate() + 1);
      }
    }

    return [...attendanceList, ...synthesizedAbsentLogs];
  }, [attendanceList, ridersList, dateFrom, dateTo, today]);

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
      present: kpiLogs.filter((l) => (l.presence || (l.timeIn ? 'present' : 'absent')) === 'present').length,
      late: kpiLogs.filter((l) => (l.punctuality || (l.status === 'late' ? 'late' : 'none')) === 'late').length,
      absent: kpiLogs.filter((l) => (l.presence || (l.timeIn ? 'present' : 'absent')) === 'absent').length,
      onLeave: kpiLogs.filter((l) => l.status === 'on_leave').length
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
    const prevCount = prevKpiLogs.filter((l) => (l.presence || (l.timeIn ? 'present' : 'absent')) === 'present').length;
    const delta = kpis.present - prevCount;
    return {
      direction: delta > 0 ? ('up' as const) : delta < 0 ? ('down' as const) : ('flat' as const),
      value: `${delta >= 0 ? '+' : ''}${delta} vs yesterday`,
    };
  }, [kpis.present, prevKpiLogs]);

  const lateTrend = useMemo(() => {
    if (prevKpiLogs.length === 0) return undefined;
    const prevCount = prevKpiLogs.filter((l) => (l.punctuality || (l.status === 'late' ? 'late' : 'none')) === 'late').length;
    const delta = kpis.late - prevCount;
    return {
      direction: delta > 0 ? ('up' as const) : delta < 0 ? ('down' as const) : ('flat' as const),
      value: `${delta >= 0 ? '+' : ''}${delta} vs yesterday`,
      positive: delta <= 0,
    };
  }, [kpis.late, prevKpiLogs]);

  const absentTrend = useMemo(() => {
    if (prevKpiLogs.length === 0) return undefined;
    const prevCount = prevKpiLogs.filter((l) => (l.presence || (l.timeIn ? 'present' : 'absent')) === 'present').length;
    const delta = kpis.absent - prevCount;
    return {
      direction: delta > 0 ? ('up' as const) : delta < 0 ? ('down' as const) : ('flat' as const),
      value: `${delta >= 0 ? '+' : ''}${delta} vs yesterday`,
      positive: false,
    };
  }, [kpis.absent, prevKpiLogs]);

  const filtered = useMemo(() => {
    return fullAttendanceList.filter((l) => {
      const presenceVal = l.presence || (l.status === 'on_leave' ? 'on_leave' : l.timeIn ? 'present' : 'absent');
      const punctualityVal = l.punctuality || (l.status === 'late' ? 'late' : l.timeIn ? 'on_time' : 'none');

      return (
        l.date >= dateFrom &&
        l.date <= dateTo &&
        (zoneFilter === 'all' || l.zoneId === zoneFilter) &&
        (statusFilter === 'all' || presenceVal === statusFilter) &&
        (punctualityFilter === 'all' || punctualityVal === punctualityFilter) &&
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

  const handleDownloadDTR = (riderId: string) => {
    const selectedDtrRider = ridersList.find((r) => r.id === riderId);
    if (!selectedDtrRider) return;

    const riderZone = selectedDtrRider.zoneName || 'Zamboanga City';
    const start = new Date(dtrDateFrom);
    const riderLogs = attendanceList.filter((l) => l.riderId === riderId);

    exportEmployeeDTR({
      riderName: selectedDtrRider.name,
      riderRole: 'RIDER',
      zoneName: riderZone,
      calendarDate: start,
      logs: riderLogs
    });
  };

  const handleProcessImport = async () => {
    if (!importFile) return;
    setIsParsing(true);
    setParsingStatus('Loading document...');
    try {
      const logs = await parseDTRPdf(importFile, ridersList, setParsingStatus);
      setParsedLogs(logs);
      if (logs.length === 0) {
        appToast.error('No attendance records parsed from PDF. Please check file format.');
      } else {
        appToast.success(`Successfully parsed ${logs.length} attendance records!`);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(err);
      appToast.error(`Import failed: ${errorMsg}`);
    } finally {
      setIsParsing(false);
      setParsingStatus('');
    }
  };

  const handleSaveImported = async () => {
    setIsSaving(true);
    try {
      const { count, error } = await saveImportedLogs(parsedLogs);
      if (error) throw error;
      appToast.success(`Successfully saved ${count} records to database!`);
      setImportModalOpen(false);
      setImportFile(null);
      setParsedLogs([]);
      getAttendanceLogs().then(setAttendanceList);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(err);
      appToast.error(`Save failed: ${errorMsg}`);
    } finally {
      setIsSaving(false);
    }
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

            {/* Import DTR Secondary Outline */}
            <button
              onClick={() => setImportModalOpen(true)}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-3.5 text-xs font-semibold text-foreground shadow-2xs transition hover:bg-panel-bg sm:h-[34px] sm:w-auto cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-primary" />
              <span>Import DTR</span>
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

      <AttendanceTable logs={filtered} />

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

      {/* DTR PDF Import Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4">
          <div className="viewport-dialog relative w-full max-w-xl space-y-5 rounded-xl bg-white p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200 sm:rounded-2xl sm:p-6">
            <div className="flex justify-between items-center pb-3 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground">Import Attendance DTR (PDF)</h3>
                <p className="text-xs text-muted-foreground">
                  Upload an official DTR PDF form to parse and import attendance logs into database.
                </p>
              </div>
              <button
                onClick={() => {
                  setImportModalOpen(false);
                  setImportFile(null);
                  setParsedLogs([]);
                }}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-panel-bg"
              >
                ✕
              </button>
            </div>

            {!parsedLogs.length ? (
              <div className="space-y-4">
                <div className="border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-8 text-center bg-panel-bg transition-colors cursor-pointer relative">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="w-8 h-8 text-primary mx-auto mb-2 opacity-80" />
                  <div className="text-xs font-semibold text-foreground">
                    {importFile ? importFile.name : 'Click or drag PDF DTR file here'}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">Supports standard DTR PDF exports</div>
                </div>

                {isParsing && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                    <Clock className="w-4 h-4 animate-spin text-primary" />
                    <span>{parsingStatus || 'Parsing PDF file...'}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                    Parsed {parsedLogs.length} attendance records
                  </span>
                  <button
                    onClick={() => setParsedLogs([])}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Re-upload file
                  </button>
                </div>

                <div className="max-h-[250px] overflow-y-auto border border-border rounded-lg p-2 space-y-1.5 bg-panel-bg custom-scrollbar text-xs">
                  {parsedLogs.map((log, i) => (
                    <div
                      key={i}
                      className="p-2 bg-white rounded border border-border flex justify-between items-center font-mono text-[11px]"
                    >
                      <div>
                        <span className="font-bold text-foreground">{log.riderName}</span>
                        <span className="text-muted-foreground ml-2">({log.date})</span>
                      </div>
                      <div>
                        <span>
                          {log.timeIn || '—'} → {log.timeOut || '—'}
                        </span>
                        <span className="ml-2 font-bold text-primary">{log.hours}h</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              <button
                onClick={() => {
                  setImportModalOpen(false);
                  setImportFile(null);
                  setParsedLogs([]);
                }}
                className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground rounded-lg hover:bg-panel-bg transition"
              >
                Cancel
              </button>

              {!parsedLogs.length ? (
                <button
                  disabled={!importFile || isParsing}
                  onClick={handleProcessImport}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-bold transition shadow-sm"
                >
                  <span>Parse PDF DTR</span>
                </button>
              ) : (
                <button
                  disabled={isSaving}
                  onClick={handleSaveImported}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm"
                >
                  {isSaving ? 'Saving...' : 'Save All Records to Database'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
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
