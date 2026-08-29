import { useMemo, useState, useEffect, useRef } from 'react';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Layers,
  Loader2,
  Clock,
  ArrowRight,
  Calculator,
  CheckCircle,
  FileText,
  AlertCircle,
  Play,
  TrendingUp,
  Sparkles,
  CheckSquare,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { getPayrollRecords, initializeCutoffPayrollForFleet } from '../services/parcelService';
import { PayrollDetailsModal } from '../components/payroll/PayrollDetailsModal';
import { AnimatePresence } from 'framer-motion';
import { RiderPayrollList, type PayrollRecordRow } from '../components/payroll/RiderPayrollList';
import { getActivityLogs, type ActivityLog } from '../lib/apiService';
import { PayrollStatus } from '../types/payroll';
import { supabase } from '../lib/supabaseClient';
import { calculatePayrollRecordTotals } from '../lib/payroll/payrollAdjustments';
import {
  getPayrollWeek,
  previousPayrollWeek,
  nextPayrollWeek,
  getRecentPayrollWeeks,
  WEEKLY_PAYROLL_START_DATE,
  getManilaBusinessDate,
  diffDays,
  type PayrollWeekPeriod,
} from '../lib/payroll/payrollCalendar';

function phpFmt(n: number) {
  return `₱${n.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatActivityTime(dateStr: string) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return dateStr;
  }
}

interface PayrollDashboardProps {
  role?: 'admin' | 'hr' | 'payroll';
  onNavigate?: (page: 'dashboard' | 'computation' | 'reports') => void;
}

export function PayrollDashboard({ role = 'payroll', onNavigate }: PayrollDashboardProps) {
  const currentUserRole = role;
  const [selectedWeek, setSelectedWeek] = useState<PayrollWeekPeriod>(() => getPayrollWeek());
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const recentWeeks = useMemo(() => getRecentPayrollWeeks(12), []);

  const [allCutoffRecords, setAllCutoffRecords] = useState<PayrollRecordRow[]>([]);
  const [activeRidersCount, setActiveRidersCount] = useState(0);
  const [ridersWithLogsCount, setRidersWithLogsCount] = useState(0);

  // Recent activity logs states
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  // Details Modal States (for Admin/HR Checklist review)
  const [selectedRecordForDetails, setSelectedRecordForDetails] = useState<PayrollRecordRow | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [recordsInPage, setRecordsInPage] = useState<PayrollRecordRow[]>([]);
  const [pendingReviewRequest, setPendingReviewRequest] = useState(0);
  const approvalWorkspaceRef = useRef<HTMLDivElement>(null);

  // Derive Cutoff Period Date range
  const cutoffFrom = selectedWeek.cutoff_start;
  const cutoffTo = selectedWeek.cutoff_end;
  const cutoffLabel = selectedWeek.label;

  // Derive Cutoff Progress & Days Remaining
  const cutoffProgress = useMemo(() => {
    const todayManila = getManilaBusinessDate();
    const totalDays = 7;

    if (todayManila < selectedWeek.cutoff_start) {
      return { dayNumber: 0, totalDays, daysRemaining: totalDays, percentage: 0, isClosed: false };
    } else if (todayManila > selectedWeek.cutoff_end) {
      return { dayNumber: totalDays, totalDays, daysRemaining: 0, percentage: 100, isClosed: true };
    } else {
      const elapsed = diffDays(todayManila, selectedWeek.cutoff_start) + 1;
      const remaining = diffDays(selectedWeek.cutoff_end, todayManila);
      const pct = Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100)));
      return { dayNumber: elapsed, totalDays, daysRemaining: remaining, percentage: pct, isClosed: false };
    }
  }, [selectedWeek]);

  // Fetch all records & rider totals for cutoff
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const records = await getPayrollRecords(cutoffFrom, cutoffTo);
        setAllCutoffRecords(records as unknown as PayrollRecordRow[]);

        // Count riders who were employed for at least one day in this cutoff.
        const { data: eligibleRiders, error: eligibilityError } = await supabase.rpc('get_payroll_eligible_rider_ids', {
          p_cutoff_start: cutoffFrom,
          p_cutoff_end: cutoffTo,
        });
        if (eligibilityError) throw eligibilityError;
        const eligibleIds = (eligibleRiders || []).map((row: { rider_id: string }) => row.rider_id);
        if (eligibleIds.length === 0) {
          setActiveRidersCount(0);
        } else {
          const { count, error: riderCountError } = await supabase
            .from('riders')
            .select('*', { count: 'exact', head: true })
            .in('id', eligibleIds);
          if (riderCountError) throw riderCountError;
          setActiveRidersCount(count || 0);
        }

        // Fetch distinct riders with parcel logs for cutoff
        const { data: logs } = await supabase
          .from('parcel_logs')
          .select('rider_id')
          .gte('date', cutoffFrom)
          .lte('date', cutoffTo);

        const distinctRiders = new Set((logs || []).map(l => l.rider_id));
        setRidersWithLogsCount(distinctRiders.size);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      }
    };
    loadDashboardData();
  }, [cutoffFrom, cutoffTo, reloadTrigger]);

  // Fetch recent payroll activities
  useEffect(() => {
    if (role !== 'payroll') return;
    const fetchActivities = async () => {
      setLoadingActivities(true);
      try {
        const logs = await getActivityLogs();
        const filtered = logs.filter(l =>
          l.event_type?.includes('payroll') ||
          l.event_type?.includes('parcel') ||
          l.description?.toLowerCase().includes('payroll') ||
          l.description?.toLowerCase().includes('payslip')
        );
        setActivities(filtered.slice(0, 8));
      } catch (err) {
        console.error('Failed to load activity logs:', err);
      } finally {
        setLoadingActivities(false);
      }
    };
    fetchActivities();
  }, [role, reloadTrigger]);

  // Compute fleet totals and Work Queue statistics
  const totals = useMemo(() => {
    const totalGross = allCutoffRecords.reduce((s, r) => s + (r.gross_pay ?? 0), 0);
    const totalNet = allCutoffRecords.reduce(
      (sum, record) => sum + calculatePayrollRecordTotals(record).netPay,
      0,
    );
    const totalParcels = allCutoffRecords.reduce((s, r) => s + (r.total_parcels || 0), 0);
    const standardParcels = allCutoffRecords.reduce((s, r) => s + Number(r.standard_parcels ?? r.total_parcels ?? 0), 0);
    const heavyParcels = allCutoffRecords.reduce((s, r) => s + Number(r.heavy_parcels ?? 0), 0);
    const standardEarnings = allCutoffRecords.reduce((s, r) => s + Number(r.standard_earnings ?? r.gross_pay ?? 0), 0);
    const heavyEarnings = allCutoffRecords.reduce((s, r) => s + Number(r.heavy_earnings ?? 0), 0);

    // Work Queue Pipeline metrics
    const draft = allCutoffRecords.filter(r => r.status === PayrollStatus.DRAFT || !r.status).length;
    const pending = allCutoffRecords.filter(r => r.status === PayrollStatus.PENDING).length;
    const approved = allCutoffRecords.filter(r => r.status === PayrollStatus.APPROVED).length;
    const rejected = allCutoffRecords.filter(r => r.status === PayrollStatus.REJECTED).length;
    const paid = allCutoffRecords.filter(r => r.status === PayrollStatus.PAID).length;
    const flagged = allCutoffRecords.filter(r => r.status === PayrollStatus.FLAGGED).length;

    // Attention Metrics
    const missingLogs = Math.max(0, activeRidersCount - ridersWithLogsCount);
    const attentionNeeded = flagged + rejected;

    return {
      totalGross,
      totalNet,
      totalParcels,
      standardParcels,
      heavyParcels,
      standardEarnings,
      heavyEarnings,
      draft,
      pending,
      approved,
      rejected,
      paid,
      flagged,
      missingLogs,
      attentionNeeded,
      readyForComputation: ridersWithLogsCount
    };
  }, [allCutoffRecords, activeRidersCount, ridersWithLogsCount]);

  const activeIndex = useMemo(() => {
    if (!selectedRecordForDetails) return -1;
    return recordsInPage.findIndex(r => r.id === selectedRecordForDetails.id);
  }, [selectedRecordForDetails, recordsInPage]);

  const handlePrev = () => {
    if (activeIndex > 0) {
      setSelectedRecordForDetails(recordsInPage[activeIndex - 1]);
    }
  };

  const handleNext = () => {
    if (activeIndex < recordsInPage.length - 1) {
      setSelectedRecordForDetails(recordsInPage[activeIndex + 1]);
    }
  };

  const handleOpenDetails = (record: PayrollRecordRow, allRecords: PayrollRecordRow[]) => {
    setSelectedRecordForDetails(record);
    setRecordsInPage(allRecords);
    setIsModalOpen(true);
  };

  const handleInitializeFleet = async () => {
    setIsInitializing(true);
    try {
      await initializeCutoffPayrollForFleet(cutoffFrom, cutoffTo);
      setReloadTrigger(prev => prev + 1);
    } catch (err) {
      console.error('Failed to initialize fleet cutoff:', err);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleReviewApprovals = () => {
    setPendingReviewRequest(current => current + 1);
    window.requestAnimationFrame(() => {
      approvalWorkspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div className="dashboard-page space-y-5">

      {/* 1. SHARED CUTOFF OVERVIEW & INTEGRATED ACTION BAR (CONSISTENT FOR ALL ROLES) */}
      <div className="ui-card space-y-4 p-4 md:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-border pb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-accent text-primary text-[10.5px] font-bold tracking-wide uppercase">
                <Sparkles className="w-3 h-3" />
                {role === 'payroll'
                  ? 'Payroll Command Center'
                  : role === 'hr'
                    ? 'HR Payroll Approval Workspace'
                    : 'Admin Payroll Approval Workspace'}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[10.5px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Open Cutoff
              </span>
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">
              Work Period: {cutoffLabel}
            </h2>
            {selectedWeek.payable_date && (
              <p className="text-xs text-muted-foreground font-mono">
                Earliest Pay Date: {selectedWeek.payable_date}
              </p>
            )}
          </div>

          {/* Weekly Cutoff Selector & Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-border bg-panel-bg/70 p-0.5 gap-1 shadow-xs">
              <button
                type="button"
                onClick={() => setSelectedWeek(prev => previousPayrollWeek(prev))}
                disabled={selectedWeek.cutoff_start <= WEEKLY_PAYROLL_START_DATE}
                className="h-8 w-8 rounded-md bg-white border border-border text-foreground hover:bg-panel-bg flex items-center justify-center transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="Previous Week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <select
                value={selectedWeek.cutoff_start}
                onChange={e => {
                  const found = recentWeeks.find(w => w.cutoff_start === e.target.value);
                  if (found) setSelectedWeek(found);
                  else setSelectedWeek(getPayrollWeek(e.target.value));
                }}
                className="ui-control h-8 w-full px-2.5 font-mono text-xs font-semibold sm:w-48"
              >
                {recentWeeks.map(w => (
                  <option key={w.cutoff_start} value={w.cutoff_start}>
                    {w.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setSelectedWeek(prev => nextPayrollWeek(prev))}
                className="h-8 w-8 rounded-md bg-white border border-border text-foreground hover:bg-panel-bg flex items-center justify-center transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="Next Week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Compact Progress Line & Action Bar */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 pt-1">
          {/* Progress Indicator */}
          <div className="flex items-center gap-3 text-xs font-semibold text-muted-foreground">
            <span className="flex items-center gap-1.5 text-foreground font-bold">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              Day {cutoffProgress.dayNumber} of {cutoffProgress.totalDays}
            </span>
            <span>&bull;</span>
            <span className="text-primary font-bold">{cutoffProgress.percentage}% Complete</span>
            <span>&bull;</span>
            <span>{cutoffProgress.daysRemaining} Days Left</span>
          </div>

          {/* Compact Inline Action Bar */}
          <div className="flex min-w-0 w-full flex-wrap items-center gap-2 xl:w-auto xl:shrink-0 xl:justify-end">
            {role === 'payroll' ? (
              <>
                <button
                  onClick={() => onNavigate?.('computation')}
                  className="h-10 sm:h-8 px-3 rounded-lg bg-primary text-white hover:bg-primary-hover transition text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  Continue Computation
                  <ArrowRight className="w-3 h-3" />
                </button>
                <button
                  onClick={handleInitializeFleet}
                  disabled={isInitializing}
                  className="h-10 sm:h-8 px-3 rounded-lg bg-panel-bg border border-border text-foreground hover:bg-accent hover:border-primary/30 transition text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isInitializing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-primary" />}
                  Initialize Fleet
                </button>
                <button
                  onClick={() => onNavigate?.('reports')}
                  className="h-10 sm:h-8 px-3 rounded-lg bg-panel-bg border border-border text-foreground hover:bg-accent transition text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  Reports
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleReviewApprovals}
                  className="h-10 sm:h-8 px-3 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  Review Approvals ({totals.pending})
                  <ArrowRight className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onNavigate?.('reports')}
                  className="h-10 sm:h-8 px-3 rounded-lg bg-panel-bg border border-border text-foreground hover:bg-accent transition text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  Reports
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. SHARED FINANCIAL KPI SUMMARY ROW */}
      <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 divide-y md:divide-y-0 md:divide-x divide-border">
          {/* Total Parcels */}
          <div className="space-y-0.5">
            <span className="text-[10.5px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-primary" />
              Total Parcels Delivered
            </span>
            <div className="text-lg font-black text-foreground">
              {totals.totalParcels.toLocaleString()} <span className="text-xs text-subtle-text font-normal">pcs</span>
            </div>
            <div className="text-[10px] text-muted-foreground">{totals.standardParcels.toLocaleString()} standard · {totals.heavyParcels.toLocaleString()} heavy</div>
          </div>

          {/* Gross Payroll */}
          <div className="pt-2 md:pt-0 md:pl-4 space-y-0.5">
            <span className="text-[10.5px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3 text-amber-600" />
              Gross Payroll Accrued
            </span>
            <div className="text-lg font-black text-foreground">
              {phpFmt(totals.totalGross)}
            </div>
            <div className="text-[10px] text-muted-foreground">{phpFmt(totals.standardEarnings)} standard · {phpFmt(totals.heavyEarnings)} heavy</div>
          </div>

          {/* Net Payroll */}
          <div className="pt-2 md:pt-0 md:pl-4 space-y-0.5">
            <span className="text-[10.5px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Total Net Payroll
            </span>
            <div className="text-lg font-black text-emerald-700">
              {phpFmt(totals.totalNet)}
            </div>
          </div>

          {/* Flagged Discrepancies */}
          <div className="pt-2 md:pt-0 md:pl-4 space-y-0.5">
            <span className="text-[10.5px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-red-600" />
              Flagged Discrepancies
            </span>
            <div className="text-lg font-black text-foreground">
              {totals.flagged} <span className="text-xs text-subtle-text font-normal">{totals.flagged > 0 ? 'needs review' : 'all clear'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. ROLE-DIVERGENT CONTENT ZONE */}
      {role === 'payroll' ? (
        /* PAYROLL OFFICER VIEW: Computation Workflow Pipeline & Recent Activity Audit */
        <>
          {/* Workflow Pipeline */}
          <div className="bg-white border border-border rounded-xl p-4 md:p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Cutoff Computation Pipeline
              </h2>
              <span className="text-[11px] font-semibold text-muted-foreground">
                {allCutoffRecords.length} Fleet Worksheets
              </span>
            </div>

            {/* Connected Stepper Pipeline */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center">
              <div className="p-3 rounded-lg bg-panel-bg border border-border space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                  <span>1. Ready</span>
                  <Users className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="text-xl font-black text-foreground">
                  {totals.readyForComputation}
                </div>
                <p className="text-[10px] text-subtle-text truncate">Logs encoded</p>
              </div>

              <div className="p-3 rounded-lg bg-panel-bg border border-border space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                  <span>2. Draft</span>
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="text-xl font-black text-foreground">
                  {totals.draft}
                </div>
                <p className="text-[10px] text-subtle-text truncate">Worksheet open</p>
              </div>

              <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-800">
                  <span>3. Pending</span>
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="text-xl font-black text-amber-950">
                  {totals.pending}
                </div>
                <p className="text-[10px] text-amber-700/80 truncate">Needs review</p>
              </div>

              <div className="p-3 rounded-lg bg-emerald-50/50 border border-emerald-200 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-emerald-800">
                  <span>4. Approved</span>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="text-xl font-black text-emerald-950">
                  {totals.approved}
                </div>
                <p className="text-[10px] text-emerald-700/80 truncate">Ready for payout</p>
              </div>

              <div className="p-3 rounded-lg bg-sky-50/50 border border-sky-200 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-sky-800">
                  <span>5. Paid</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                </div>
                <div className="text-xl font-black text-sky-950">
                  {totals.paid}
                </div>
                <p className="text-[10px] text-sky-700/80 truncate">Disbursed</p>
              </div>
            </div>

            {/* Inline Attention Alerts */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-1 text-xs">
              <div className="flex-1 w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span><strong className="font-bold">{totals.missingLogs} Active Riders</strong> missing parcel logs for this cutoff.</span>
              </div>

              <div className="flex-1 w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-900">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                <span><strong className="font-bold">{totals.attentionNeeded} Riders</strong> requiring attention (Flagged/Rejected).</span>
              </div>
            </div>
          </div>

          {/* Recent Activity Timeline */}
          <div className="bg-white border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Recent Payroll Activity & Audit Feed
              </h3>
              <button
                onClick={() => setReloadTrigger(prev => prev + 1)}
                className="text-[11px] font-semibold text-primary hover:text-accent-foreground transition cursor-pointer"
              >
                Refresh Feed
              </button>
            </div>

            {loadingActivities ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Loading activity trail...</span>
              </div>
            ) : activities.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground italic">
                No recent payroll activity recorded for this period.
              </div>
            ) : (
              <div className="relative border-l border-border ml-3 pl-5 space-y-3.5 py-1">
                {activities.map((act) => {
                  let IconComponent = Clock;
                  let iconBg = 'bg-panel-bg border-border text-muted-foreground';

                  if (act.event_type.includes('status_update') || act.event_type.includes('finalize')) {
                    if (act.description?.includes('approved')) {
                      IconComponent = CheckCircle2;
                      iconBg = 'bg-sky-50 border-sky-200 text-sky-600';
                    } else if (act.description?.includes('paid')) {
                      IconComponent = CheckCircle2;
                      iconBg = 'bg-emerald-50 border-emerald-200 text-emerald-600';
                    } else if (act.description?.includes('flagged')) {
                      IconComponent = AlertTriangle;
                      iconBg = 'bg-red-50 border-red-200 text-red-600';
                    }
                  } else if (act.event_type.includes('adjustments_update')) {
                    IconComponent = Layers;
                    iconBg = 'bg-accent border-primary/20 text-primary';
                  }

                  return (
                    <div key={act.id} className="relative group">
                      <span className={`absolute -left-[31px] top-0 flex items-center justify-center w-5 h-5 rounded-full border ${iconBg} shadow-sm z-10 transition-colors`}>
                        <IconComponent className="w-2.5 h-2.5" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-foreground leading-snug">
                          {act.description}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-subtle-text">
                          <span>{formatActivityTime(act.created_at)}</span>
                          {act.users && (
                            <>
                              <span>&bull;</span>
                              <span>By {act.users.full_name} ({act.users.role})</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        /* HR / ADMIN VIEW: Primary Hero Approval Workspace */
        <div ref={approvalWorkspaceRef} className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-amber-600" />
              Rider Payroll Approval Checklist Workspace
            </h2>
          </div>
          <RiderPayrollList
            cutoffFrom={cutoffFrom}
            cutoffTo={cutoffTo}
            role={currentUserRole}
            reloadTrigger={reloadTrigger}
            pendingReviewRequest={pendingReviewRequest}
            onStatusUpdated={() => setReloadTrigger(prev => prev + 1)}
            onOpenDetails={handleOpenDetails}
          />
        </div>
      )}

      {/* Details drawer for Admin/HR review */}
      <AnimatePresence>
        {isModalOpen && selectedRecordForDetails && (
          <PayrollDetailsModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            record={selectedRecordForDetails}
            onStatusUpdated={() => setReloadTrigger(prev => prev + 1)}
            onPrev={handlePrev}
            onNext={handleNext}
            hasPrev={activeIndex > 0}
            hasNext={activeIndex < recordsInPage.length - 1}
            role={currentUserRole as 'admin' | 'hr' | 'payroll' | 'rider'}
            indexLabel={`${activeIndex + 1} of ${recordsInPage.length}`}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
