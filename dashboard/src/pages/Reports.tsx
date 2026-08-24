import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon, AlertTriangle, Award, CheckCircle2, Clock, Loader2, MapPin,
  RefreshCw, RotateCcw, Sparkles, TrendingDown, TrendingUp, Users,
} from 'lucide-react';
import {
  AttendanceDistributionChart, AttendanceRateChart, RiderPerformanceChart,
  ViolationsByZoneChart, ZoneCoverageChart,
} from '../components/reports/Charts';
import { ChartsGridSkeleton } from '../components/reports/ReportsSkeleton';
import { useHub } from '../context/HubContext';
import { useRiderZone } from '../context/RiderZoneContext';
import { useExportJob } from '../hooks/useExportJob';
import { pushToast } from '../hooks/useToast';
import { deriveReportsAnalytics, type ReportsAnalytics, type ReportsFilters } from '../lib/reportsAnalytics';
import { generateReport, ReportError, type ReportFormat } from '../lib/exports/reportExport';
import { getLocalDateString } from '../services/attendance/attendanceService';
import { loadReportsData } from '../services/reports/reportsDataService';

type CategoryTab = 'weekly_attendance' | 'violation_summary' | 'zone_coverage' | 'rider_performance';
type DatePreset = '7d' | '14d' | '30d' | 'custom';

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return getLocalDateString(date);
}

function comparisonText(value: number | null, unit: 'points' | 'events'): string {
  if (value == null) return 'Previous-period comparison unavailable';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value} ${unit} vs equal previous period`;
}

export function Reports() {
  const today = useMemo(() => getLocalDateString(), []);
  const defaultFrom = useMemo(() => daysAgo(14), []);
  const [activeTab, setActiveTab] = useState<CategoryTab>('weekly_attendance');
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [selectedZone, setSelectedZone] = useState('all');
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(today);
  const [datePreset, setDatePreset] = useState<DatePreset>('14d');
  const [analytics, setAnalytics] = useState<ReportsAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestId = useRef(0);
  const exportJob = useExportJob();
  const { zones: zonesList } = useRiderZone();
  const { selectedHubId, selectedHub, isReady: hubReady, workspaceKey } = useHub();

  const filters = useMemo<ReportsFilters>(() => ({
    from: dateFrom,
    to: dateTo,
    hubId: selectedHubId,
    zoneId: selectedZone,
  }), [dateFrom, dateTo, selectedHubId, selectedZone]);

  useEffect(() => {
    if (selectedZone !== 'all' && !zonesList.some(zone => zone.id === selectedZone)) {
      setSelectedZone('all');
    }
  }, [selectedZone, zonesList]);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    setAnalytics(null);
    setDataError(null);
    if (!hubReady) {
      setIsLoading(true);
      return;
    }
    if (!dateFrom || !dateTo || dateTo < dateFrom) {
      setIsLoading(false);
      setDataError('Select a valid reporting period to load analytics.');
      return;
    }
    setIsLoading(true);
    void loadReportsData(filters)
      .then(data => {
        if (currentRequest !== requestId.current) return;
        setAnalytics(deriveReportsAnalytics({ ...data, filters }));
      })
      .catch(error => {
        if (currentRequest !== requestId.current) return;
        console.error('Failed to load fresh Reports data:', error);
        setDataError('Reports data could not be refreshed. No stale values are being shown.');
      })
      .finally(() => {
        if (currentRequest === requestId.current) setIsLoading(false);
      });
  }, [dateFrom, dateTo, filters, hubReady, refreshKey, workspaceKey]);

  const scopeLabel = selectedHub ? selectedHub.name : 'All authorized Hubs';
  const zoneLabel = selectedZone === 'all'
    ? 'All Zones'
    : zonesList.find(zone => zone.id === selectedZone)?.name ?? 'Selected Zone';
  const modified = selectedZone !== 'all' || dateFrom !== defaultFrom || dateTo !== today;

  const applyPreset = (preset: Exclude<DatePreset, 'custom'>) => {
    const days = preset === '7d' ? 7 : preset === '14d' ? 14 : 30;
    setDatePreset(preset);
    setDateTo(getLocalDateString());
    setDateFrom(daysAgo(days));
  };

  const resetFilters = () => {
    setSelectedZone('all');
    setDatePreset('14d');
    setDateFrom(defaultFrom);
    setDateTo(today);
    setValidationError(null);
  };

  async function handleGenerate() {
    if (!dateFrom || !dateTo || dateTo < dateFrom) {
      setValidationError('Please select a valid date range.');
      return;
    }
    setValidationError(null);
    try {
      const outcome = await exportJob.run('Preparing report…', async setMessage => {
        setMessage(`Generating ${format.toUpperCase()} report…`);
        return generateReport({
          template: activeTab,
          format,
          from: dateFrom,
          to: dateTo,
          zoneIds: selectedZone === 'all' ? [] : [selectedZone],
        });
      });
      if (!outcome.started || !outcome.value) return;
      pushToast({
        title: 'Report downloaded',
        description: `${outcome.value.rowCount} record${outcome.value.rowCount === 1 ? '' : 's'} exported as ${format.toUpperCase()}.`,
        tone: 'success',
      });
    } catch (error) {
      if (error instanceof ReportError && error.code === 'INVALID_RANGE') {
        setValidationError(error.message);
      } else if (error instanceof ReportError && error.code === 'NO_DATA') {
        pushToast({ title: 'No data to export', description: 'No records match the selected period and scope.', tone: 'warning' });
      } else {
        pushToast({ title: 'Report export failed', description: 'The file was not downloaded. Please try again.', tone: 'error' });
      }
    }
  }

  const metrics = analytics?.metrics;
  const comparisons = analytics?.comparisons;
  const attendanceDelta = comparisons?.attendanceRateDeltaPoints ?? null;
  const violationDelta = comparisons?.violationDelta ?? null;

  return (
    <div className="dashboard-page space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-panel-bg px-3 py-2 text-[11px] text-muted-foreground">
        <span><strong className="text-foreground">Scope:</strong> {scopeLabel} · {zoneLabel}</span>
        <span className="font-mono"><strong className="text-foreground">Period:</strong> {dateFrom} to {dateTo}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy={isLoading}>
        <KpiCard label="Attendance Rate" icon={CheckCircle2} tone="emerald" value={metrics?.attendanceRate == null ? '—' : `${metrics.attendanceRate}%`} detail={comparisonText(attendanceDelta, 'points')} trend={attendanceDelta} />
        <KpiCard label="Total Violations" icon={AlertOctagon} tone="red" value={metrics ? String(metrics.totalViolations) : '—'} detail={comparisonText(violationDelta, 'events')} trend={violationDelta == null ? null : -violationDelta} />
        <KpiCard label="Avg Completed Shift" icon={Clock} tone="amber" value={metrics?.averageCompletedShiftHours == null ? '—' : `${metrics.averageCompletedShiftHours} hrs`} detail="Completed time-in/time-out records only" />
        <KpiCard label="Riders Reporting" icon={Users} tone="blue" value={metrics ? String(metrics.ridersReporting) : '—'} detail="Unique Riders with matching attendance records" />
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {([
              ['weekly_attendance', 'Attendance', CheckCircle2], ['violation_summary', 'Violations & Safety', AlertOctagon],
              ['zone_coverage', 'Zone Analytics', MapPin], ['rider_performance', 'Rider Performance', Award],
            ] as const).map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setActiveTab(id)} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${activeTab === id ? 'bg-primary text-white shadow-2xs' : 'border border-border bg-panel-bg text-muted-foreground hover:bg-white hover:text-foreground'}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
          </div>
          <button type="button" disabled={!modified} onClick={resetFilters} className={`flex items-center gap-1.5 text-xs font-semibold ${modified ? 'cursor-pointer text-primary hover:text-primary-hover' : 'cursor-not-allowed text-muted-foreground opacity-40'}`}><RotateCcw className="h-3.5 w-3.5" />Reset Filters</button>
        </div>

        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div className="flex flex-1 flex-wrap items-end gap-3">
            <Control label="Presets"><div className="flex h-[34px] items-center gap-1 rounded-md border border-border bg-panel-bg p-0.5">{(['7d', '14d', '30d'] as const).map(preset => <button key={preset} type="button" onClick={() => applyPreset(preset)} className={`h-7 rounded px-2.5 text-[11px] font-semibold ${datePreset === preset ? 'border border-border bg-white text-primary shadow-2xs' : 'text-muted-foreground hover:text-foreground'}`}>{preset.toUpperCase()}</button>)}</div></Control>
            <Control label="From"><input type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setDatePreset('custom'); }} className="rep-ctrl-input" /></Control>
            <Control label="To"><input type="date" value={dateTo} onChange={event => { setDateTo(event.target.value); setDatePreset('custom'); }} className="rep-ctrl-input" /></Control>
            <Control label="Zone"><select value={selectedZone} onChange={event => setSelectedZone(event.target.value)} className="rep-ctrl-input"><option value="all">All Zones ({zonesList.length})</option>{zonesList.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></Control>
          </div>
          <div className="flex shrink-0 flex-wrap items-end gap-2.5 border-t border-border pt-2 lg:border-t-0 lg:pt-0">
            <Control label="Format"><div className="flex h-[34px] items-center rounded-md border border-border bg-panel-bg p-0.5">{(['pdf', 'csv', 'xlsx'] as const).map(item => <button key={item} type="button" onClick={() => setFormat(item)} className={`h-7 rounded px-3 text-xs font-bold uppercase ${format === item ? 'border border-border bg-white text-primary shadow-2xs' : 'text-muted-foreground hover:text-foreground'}`}>{item}</button>)}</div></Control>
            <button type="button" onClick={() => void handleGenerate()} disabled={exportJob.running} className="inline-flex h-[34px] cursor-pointer items-center gap-2 rounded-lg bg-primary px-5 text-xs font-bold text-white shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60">{exportJob.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}<span>{exportJob.message ?? 'Generate Report'}</span></button>
          </div>
        </div>
        {validationError && <Message>{validationError}</Message>}
      </div>

      {isLoading ? <ChartsGridSkeleton /> : dataError ? <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 p-5 text-center"><AlertTriangle className="mb-2 h-7 w-7 text-red-600" /><p className="text-sm font-semibold text-red-800">Reports data unavailable</p><p className="mt-1 text-xs text-red-700">{dataError}</p><button type="button" onClick={() => setRefreshKey(key => key + 1)} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700"><RefreshCw className="h-3.5 w-3.5" />Retry</button></div> : analytics ? <>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3"><div className="lg:col-span-2">{activeTab === 'weekly_attendance' && <AttendanceRateChart data={analytics.attendanceTrend} />}{activeTab === 'violation_summary' && <ViolationsByZoneChart data={analytics.violationByZone} />}{activeTab === 'zone_coverage' && <ZoneCoverageChart data={analytics.zoneCoverage} />}{activeTab === 'rider_performance' && <RiderPerformanceChart data={analytics.riderPerformance} />}</div><AttendanceDistributionChart data={analytics.attendanceBreakdown} /></div>
        <div className="space-y-4 rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 pb-3"><div className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/30 bg-accent"><Sparkles className="h-4 w-4 text-primary" /></div><div><h3 className="text-sm font-bold text-foreground">Operational Insights</h3><p className="font-mono text-[11px] text-muted-foreground">Deterministic summaries from the filtered records above</p></div></div><span className="rounded-full border border-primary/20 bg-accent px-2.5 py-1 font-mono text-[11px] font-semibold text-accent-foreground">Automated Summary</span></div>
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-4"><Insight title="Attendance" icon={TrendingUp} tone="text-emerald-700">{analytics.insights.attendance}</Insight><Insight title="Top Zone" icon={MapPin} tone="text-primary">{analytics.insights.topZone}</Insight><Insight title="Violation Hotspot" icon={AlertTriangle} tone="text-red-600">{analytics.insights.geofenceHotspot}</Insight><Insight title="Rider Attention" icon={Users} tone="text-blue-600">{analytics.insights.riderAttention}</Insight></div>
        </div>
      </> : null}

      <style>{`.rep-ctrl-input{height:34px;padding:0 10px;background:var(--panel-bg);border:1px solid var(--border);border-radius:6px;color:var(--foreground);font-size:12px;outline:none;font-family:'Geist Mono',monospace;transition:border-color 150ms ease,box-shadow 150ms ease}.rep-ctrl-input:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(219,108,0,.12)}select.rep-ctrl-input{appearance:none;padding-right:28px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B6258' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center}`}</style>
    </div>
  );
}

function KpiCard({ label, icon: Icon, tone, value, detail, trend }: { label: string; icon: typeof Users; tone: 'emerald' | 'red' | 'amber' | 'blue'; value: string; detail: string; trend?: number | null }) {
  const tones = { emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200', red: 'bg-red-50 text-red-600 border-red-200', amber: 'bg-amber-50 text-amber-600 border-amber-200', blue: 'bg-blue-50 text-blue-600 border-blue-200' };
  const TrendIcon = trend != null && trend < 0 ? TrendingDown : TrendingUp;
  return <div className="flex flex-col justify-between rounded-xl border border-border bg-white p-4 shadow-sm"><div className="mb-2 flex items-center justify-between"><span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span><div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${tones[tone]}`}><Icon className="h-4 w-4" /></div></div><div><div className="font-mono text-2xl font-bold text-foreground">{value}</div><div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">{trend != null && <TrendIcon className="h-3.5 w-3.5" />}<span>{detail}</span></div></div></div>;
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1"><span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>{children}</div>;
}

function Message({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-600"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{children}</div>;
}

function Insight({ title, icon: Icon, tone, children }: { title: string; icon: typeof Users; tone: string; children: React.ReactNode }) {
  return <div className="space-y-1.5 rounded-lg border border-border bg-panel-bg p-3.5"><div className={`flex items-center gap-1.5 text-xs font-semibold ${tone}`}><Icon className="h-3.5 w-3.5" />{title}</div><p className="text-xs leading-relaxed text-foreground">{children}</p></div>;
}
