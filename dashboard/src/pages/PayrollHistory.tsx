import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  History,
  Search,
  Calendar,
  Layers,
  CheckCircle2,
  FileText,
  Loader2,
  Eye,
  Download,
  Printer,
  TrendingUp,
  Lock,
  SlidersHorizontal,
  BarChart2
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { PayrollStatus } from '../types/payroll';
import {
  buildPayslipDocumentData,
  exportCutoffSummaryCSV,
  exportCutoffSummaryPDF,
  exportCutoffSummaryXLSX,
  printParcelPayslipDocument,
  type PayslipDocumentData,
} from '../lib/exports/payrollExport';
import { AnimatePresence, motion } from 'framer-motion';
import type { PageKey } from '../components/common/Sidebar';
import { PayrollActorIdentity } from '../components/payroll/PayrollActorIdentity';
import { RightDrawer } from '../components/common/RightDrawer';
import { PayrollHistorySkeleton } from '../components/payroll/PayrollDashboardSkeleton';
import {
  calculatePayrollRecordTotals,
  payslipAdjustmentsFromRecord,
} from '../lib/payroll/payrollAdjustments';
import { formatPayrollPeriod } from '../lib/payroll/payrollCalendar';

export interface HistoricalRecord {
  id: string;
  rider_id: string;
  cutoff_start: string;
  cutoff_end: string;
  total_parcels: number;
  rate_per_parcel: number;
  gross_pay: number;
  standard_parcels: number | null;
  heavy_parcels: number | null;
  standard_earnings: number | null;
  heavy_earnings: number | null;
  rate_configuration_id: string | null;
  calculation_version: number | null;
  snapshot_finalized_at: string | null;
  other_earnings: number | null;
  fm_pickup_count: number | null;
  fm_pickup_amount: number;
  deductions: number | null;
  late_onhold: number | null;
  late_remittance: number | null;
  adjustment_snapshot: unknown;
  adjustment_snapshot_version: number | null;
  adjustment_source_version: number;
  total_earnings_snapshot: number | null;
  total_deductions_snapshot: number | null;
  net_pay_snapshot: number | null;
  notes: string | null;
  status: PayrollStatus;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  submitted_by_name_snapshot: string | null;
  submitted_by_email_snapshot: string | null;
  approved_by: string | null;
  paid_at: string | null;
  approved_at: string | null;
  approved_by_name_snapshot: string | null;
  approved_by_email_snapshot: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejected_by_name_snapshot: string | null;
  rejected_by_email_snapshot: string | null;
  rejection_reason: string | null;
  returned_by: string | null;
  returned_at: string | null;
  returned_by_name_snapshot: string | null;
  returned_by_email_snapshot: string | null;
  paid_by: string | null;
  paid_by_name_snapshot: string | null;
  paid_by_email_snapshot: string | null;
  riders: {
    id: string;
    name: string;
    mkb_id: string;
    avatar_url: string | null;
    zone_id: string | null;
    zones: { name: string } | null;
  };
  submitted_user?: { full_name: string; email?: string } | null;
  approved_user?: { full_name: string; email?: string } | null;
  rejected_user?: { full_name: string; email?: string } | null;
  returned_user?: { full_name: string; email?: string } | null;
  paid_user?: { full_name: string; email?: string } | null;
  payroll_delivery_lines: Array<{
    date: string; standard_delivered: number; heavy_delivered: number; failed: number; returned: number;
    applied_standard_rate: number; applied_heavy_rate: number; standard_earnings: number; heavy_earnings: number;
    gross_delivery_pay: number; rate_configuration_id: string | null; calculation_version: number;
  }>;
}

export interface CutoffSummaryGroup {
  cutoffKey: string;
  cutoffStart: string;
  cutoffEnd: string;
  label: string;
  recordCount: number;
  totalParcels: number;
  totalGross: number;
  totalNet: number;
  statusCount: Record<string, number>;
  latestUpdate: string;
  paidAt: string | null;
  records: HistoricalRecord[];
}

function phpFmt(n: number) {
  return `₱${n.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function computeNetPay(r: HistoricalRecord): number {
  return calculatePayrollRecordTotals(r).netPay;
}

function historicalRecordToPayslipDocumentData(record: HistoricalRecord): PayslipDocumentData {
  const deliveryLines = record.payroll_delivery_lines ?? [];
  const standardParcels = Number(record.standard_parcels ?? record.total_parcels ?? 0);
  const heavyParcels = Number(record.heavy_parcels ?? 0);
  return buildPayslipDocumentData({
    riderName: record.riders?.name || 'Rider',
    mkbId: record.riders?.mkb_id || '—',
    zoneName: record.riders?.zones?.name || 'Unassigned',
    cutoffFrom: record.cutoff_start,
    cutoffTo: record.cutoff_end,
    dayEntries: deliveryLines.map(line => ({
      date: line.date,
      standardParcels: Number(line.standard_delivered),
      heavyParcels: Number(line.heavy_delivered),
      failedParcels: Number(line.failed),
      returnedParcels: Number(line.returned),
      standardRate: Number(line.applied_standard_rate),
      heavyRate: Number(line.applied_heavy_rate),
      standardEarnings: Number(line.standard_earnings),
      heavyEarnings: Number(line.heavy_earnings),
      grossDeliveryPay: Number(line.gross_delivery_pay),
      rateConfigurationId: line.rate_configuration_id,
      calculationVersion: Number(line.calculation_version),
    })),
    snapshot: {
      source: record.snapshot_finalized_at ? 'snapshot' : 'legacy',
      calculationVersion: Number(record.calculation_version ?? 1),
      standardParcels,
      heavyParcels,
      failedParcels: deliveryLines.reduce((sum, line) => sum + Number(line.failed), 0),
      returnedParcels: deliveryLines.reduce((sum, line) => sum + Number(line.returned), 0),
      standardEarnings: Number(record.standard_earnings ?? record.gross_pay ?? 0),
      heavyEarnings: Number(record.heavy_earnings ?? 0),
      grossDeliveryPay: Number(record.gross_pay ?? 0),
    },
    adjustments: payslipAdjustmentsFromRecord(record),
  });
}

interface PayrollHistoryProps {
  role?: 'admin' | 'hr' | 'payroll';
  onNavigate?: (page: PageKey) => void;
}

export function PayrollHistory({ role = 'payroll' }: PayrollHistoryProps) {
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const [records, setRecords] = useState<HistoricalRecord[]>([]);
  const [zones, setZones] = useState<{ id: string; name: string }[]>([]);

  // Search and Filter States
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [cutoffFilter, setCutoffFilter] = useState<string>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'summaries' | 'records' | 'compare'>('summaries');

  // Comparison Tool States
  const [compareCutoffA, setCompareCutoffA] = useState<string>('');
  const [compareCutoffB, setCompareCutoffB] = useState<string>('');

  // Read-only Details Drawer / Modal States
  const [selectedCutoffGroup, setSelectedCutoffGroup] = useState<CutoffSummaryGroup | null>(null);
  const [selectedRiderRecord, setSelectedRiderRecord] = useState<HistoricalRecord | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isPayslipModalOpen, setIsPayslipModalOpen] = useState(false);

  // Load all historical records & zones
  const loadHistoryData = async () => {
    setLoading(true);
    try {
      // 1. Fetch zones
      const { data: zData } = await supabase.from('zones').select('id, name').order('name');
      setZones(zData || []);

      // 2. Fetch all historical payroll_records
      const { data: recData, error } = await supabase
        .from('payroll_records')
        .select(`
          *,
          riders!inner(id, name, mkb_id, avatar_url, zone_id, zones!riders_zone_id_fkey(name)),
          submitted_user:users!payroll_records_submitted_by_fkey(full_name, email),
          approved_user:users!payroll_records_approved_by_fkey(full_name, email),
          rejected_user:users!payroll_records_rejected_by_fkey(full_name, email),
          returned_user:users!payroll_records_returned_by_fkey(full_name, email),
          paid_user:users!payroll_records_paid_by_fkey(full_name, email)
          ,payroll_delivery_lines(date, standard_delivered, heavy_delivered, failed, returned, applied_standard_rate, applied_heavy_rate, standard_earnings, heavy_earnings, gross_delivery_pay, rate_configuration_id, calculation_version)
        `)
        .order('cutoff_start', { ascending: false });

      if (error) throw error;
      setRecords((recData || []) as unknown as HistoricalRecord[]);
    } catch (err) {
      console.error('Failed to load payroll history:', err);
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistoryData();
  }, []);

  // Distinct Cutoff Periods for Dropdowns
  const distinctCutoffs = useMemo(() => {
    const map = new Map<string, { start: string; end: string; label: string }>();
    for (const r of records) {
      if (!r.cutoff_start) continue;
      const key = `${r.cutoff_start}_${r.cutoff_end}`;
      if (!map.has(key)) {
        map.set(key, {
          start: r.cutoff_start,
          end: r.cutoff_end,
          label: formatPayrollPeriod(r.cutoff_start, r.cutoff_end),
        });
      }
    }
    return Array.from(map.entries()).map(([key, val]) => ({ key, ...val }));
  }, [records]);

  // Set default comparison cutoffs once data loads
  useEffect(() => {
    if (distinctCutoffs.length > 0 && !compareCutoffA) {
      setCompareCutoffA(distinctCutoffs[0].key);
      if (distinctCutoffs.length > 1) {
        setCompareCutoffB(distinctCutoffs[1].key);
      } else {
        setCompareCutoffB(distinctCutoffs[0].key);
      }
    }
  }, [distinctCutoffs, compareCutoffA]);

  // Filtered Detailed Records
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      // Search
      const searchLower = search.toLowerCase().trim();
      const riderName = r.riders?.name || '';
      const mkbId = r.riders?.mkb_id || '';
      const cutoffStr = `${r.cutoff_start} ${r.cutoff_end}`;
      const matchesSearch =
        !searchLower ||
        riderName.toLowerCase().includes(searchLower) ||
        mkbId.toLowerCase().includes(searchLower) ||
        cutoffStr.toLowerCase().includes(searchLower) ||
        (r.status || '').toLowerCase().includes(searchLower);

      // Status
      const matchesStatus =
        statusFilter === 'all' || (r.status || '').toLowerCase() === statusFilter.toLowerCase();

      // Cutoff
      const matchesCutoff =
        cutoffFilter === 'all' || `${r.cutoff_start}_${r.cutoff_end}` === cutoffFilter;

      // Zone
      const matchesZone =
        zoneFilter === 'all' || r.riders?.zone_id === zoneFilter;

      return matchesSearch && matchesStatus && matchesCutoff && matchesZone;
    });
  }, [records, search, statusFilter, cutoffFilter, zoneFilter]);

  // Grouped Cutoff Summaries
  const cutoffGroups = useMemo(() => {
    const map = new Map<string, CutoffSummaryGroup>();

    for (const r of filteredRecords) {
      const key = `${r.cutoff_start}_${r.cutoff_end}`;
      const label = formatPayrollPeriod(r.cutoff_start, r.cutoff_end);

      const net = computeNetPay(r);
      const gross = Number(r.gross_pay || 0);
      const parcels = Number(r.total_parcels || 0);

      const existing = map.get(key) || {
        cutoffKey: key,
        cutoffStart: r.cutoff_start,
        cutoffEnd: r.cutoff_end,
        label,
        recordCount: 0,
        totalParcels: 0,
        totalGross: 0,
        totalNet: 0,
        statusCount: {},
        latestUpdate: r.updated_at,
        paidAt: r.paid_at,
        records: []
      };

      existing.recordCount += 1;
      existing.totalParcels += parcels;
      existing.totalGross += gross;
      existing.totalNet += net;
      existing.records.push(r);

      const st = r.status || 'draft';
      existing.statusCount[st] = (existing.statusCount[st] || 0) + 1;
      if (r.paid_at && !existing.paidAt) existing.paidAt = r.paid_at;
      if (new Date(r.updated_at) > new Date(existing.latestUpdate)) {
        existing.latestUpdate = r.updated_at;
      }

      map.set(key, existing);
    }

    return Array.from(map.values());
  }, [filteredRecords]);

  // Aggregated Summary Stats over Filtered Data
  const kpiTotals = useMemo(() => {
    const totalCutoffs = cutoffGroups.length;
    const totalRecords = filteredRecords.length;
    const totalParcels = filteredRecords.reduce((s, r) => s + Number(r.total_parcels || 0), 0);
    const totalGross = filteredRecords.reduce((s, r) => s + Number(r.gross_pay || 0), 0);
    const totalNet = filteredRecords.reduce((s, r) => s + computeNetPay(r), 0);

    return {
      totalCutoffs,
      totalRecords,
      totalParcels,
      totalGross,
      totalNet
    };
  }, [cutoffGroups, filteredRecords]);

  // Comparison Computation
  const comparisonData = useMemo(() => {
    const groupA = cutoffGroups.find(g => g.cutoffKey === compareCutoffA);
    const groupB = cutoffGroups.find(g => g.cutoffKey === compareCutoffB);

    if (!groupA || !groupB) return null;

    const parcelsDiff = groupA.totalParcels - groupB.totalParcels;
    const grossDiff = groupA.totalGross - groupB.totalGross;
    const netDiff = groupA.totalNet - groupB.totalNet;
    const ridersDiff = groupA.recordCount - groupB.recordCount;

    return {
      groupA,
      groupB,
      parcelsDiff,
      grossDiff,
      netDiff,
      ridersDiff,
      parcelsPct: groupB.totalParcels ? Math.round((parcelsDiff / groupB.totalParcels) * 100) : 0,
      netPct: groupB.totalNet ? Math.round((netDiff / groupB.totalNet) * 100) : 0
    };
  }, [cutoffGroups, compareCutoffA, compareCutoffB]);

  // Export Cutoff Records to CSV / XLSX / PDF
  const handleExportCutoff = (group: CutoffSummaryGroup, format: 'csv' | 'xlsx' | 'pdf') => {
    const rows = group.records.map(r => ({
      riderName: r.riders?.name || 'Rider',
      riderId: r.riders?.mkb_id || '—',
      zone: r.riders?.zones?.name || 'Unassigned',
      totalParcels: r.total_parcels || 0,
      standardParcels: Number(r.standard_parcels ?? r.total_parcels ?? 0),
      heavyParcels: Number(r.heavy_parcels ?? 0),
      failedParcels: (r.payroll_delivery_lines ?? []).reduce((sum, line) => sum + Number(line.failed), 0),
      returnedParcels: (r.payroll_delivery_lines ?? []).reduce((sum, line) => sum + Number(line.returned), 0),
      standardEarnings: Number(r.standard_earnings ?? r.gross_pay ?? 0),
      heavyEarnings: Number(r.heavy_earnings ?? 0),
      calculationVersion: Number(r.calculation_version ?? 1),
      flagged: r.status === 'flagged' ? 'YES' : 'NO',
      grossPay: r.gross_pay || 0
    }));

    if (format === 'csv') {
      exportCutoffSummaryCSV(rows, { label: group.label, from: group.cutoffStart, to: group.cutoffEnd });
    } else if (format === 'xlsx') {
      void exportCutoffSummaryXLSX(rows, { label: group.label, from: group.cutoffStart, to: group.cutoffEnd });
    } else {
      exportCutoffSummaryPDF(rows, { label: group.label, from: group.cutoffStart, to: group.cutoffEnd });
    }
  };

  if (loading && !hasLoadedRef.current) return <PayrollHistorySkeleton />;

  return (
    <div className="dashboard-page space-y-5">

      {/* Archive context and actions; the app shell owns the page title. */}
      <div className="ui-toolbar">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-accent text-primary text-[10.5px] font-bold tracking-wide uppercase">
              <History className="w-3.5 h-3.5" />
              Historical Archive
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-panel-bg text-muted-foreground border border-border text-[10.5px] font-semibold">
              <Lock className="w-3 h-3 text-primary" />
              Read-Only Archive ({role.toUpperCase()})
            </span>
          </div>

          <button
            onClick={loadHistoryData}
            className="ui-button-secondary h-8 shrink-0 text-xs"
          >
            <Loader2 className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : 'hidden'}`} />
            Refresh Archive
          </button>
        </div>
      </div>

      {/* SUMMARY STATS ROW */}
      <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 divide-y md:divide-y-0 md:divide-x divide-border">
          <div className="space-y-0.5">
            <span className="text-[10.5px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3 h-3 text-primary" />
              Historical Cutoffs
            </span>
            <div className="text-lg font-black text-foreground">
              {kpiTotals.totalCutoffs} <span className="text-xs text-subtle-text font-normal">periods ({kpiTotals.totalRecords} records)</span>
            </div>
          </div>

          <div className="pt-2 md:pt-0 md:pl-4 space-y-0.5">
            <span className="text-[10.5px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-amber-600" />
              Archived Parcels
            </span>
            <div className="text-lg font-black text-foreground">
              {kpiTotals.totalParcels.toLocaleString()} <span className="text-xs text-subtle-text font-normal">pcs</span>
            </div>
          </div>

          <div className="pt-2 md:pt-0 md:pl-4 space-y-0.5">
            <span className="text-[10.5px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3 text-amber-600" />
              Gross Payroll Accrued
            </span>
            <div className="text-lg font-black text-foreground">
              {phpFmt(kpiTotals.totalGross)}
            </div>
          </div>

          <div className="pt-2 md:pt-0 md:pl-4 space-y-0.5">
            <span className="text-[10.5px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Total Net Disbursed
            </span>
            <div className="text-lg font-black text-emerald-700">
              {phpFmt(kpiTotals.totalNet)}
            </div>
          </div>
        </div>
      </div>

      {/* CONTROLS, SEARCH & TABS */}
      <div className="bg-white border border-border rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* View Mode Tabs */}
          <div className="table-scroll-region flex w-full rounded-lg border border-border bg-panel-bg p-0.5 lg:w-auto" role="tablist" aria-label="Payroll history views" tabIndex={0}>
            <button
              onClick={() => setActiveTab('summaries')}
              className={`h-10 sm:h-8 shrink-0 px-3 rounded-md text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${activeTab === 'summaries' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Cutoff Summaries ({cutoffGroups.length})
            </button>
            <button
              onClick={() => setActiveTab('records')}
              className={`h-10 sm:h-8 shrink-0 px-3 rounded-md text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${activeTab === 'records' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <FileText className="w-3.5 h-3.5" />
              Detailed Rider Records ({filteredRecords.length})
            </button>
            <button
              onClick={() => setActiveTab('compare')}
              className={`h-10 sm:h-8 shrink-0 px-3 rounded-md text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${activeTab === 'compare' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              Compare Cutoffs
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search rider name, ID, cutoff, status..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-panel-bg border border-border text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border text-xs font-semibold text-muted-foreground">
          <span className="flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
            Filters:
          </span>

          <select
            value={cutoffFilter}
            onChange={e => setCutoffFilter(e.target.value)}
            className="h-8 px-2.5 rounded-md bg-panel-bg border border-border text-xs font-semibold text-foreground outline-none focus:border-primary cursor-pointer"
          >
            <option value="all">All Cutoff Periods ({distinctCutoffs.length})</option>
            {distinctCutoffs.map(c => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="h-8 px-2.5 rounded-md bg-panel-bg border border-border text-xs font-semibold text-foreground outline-none focus:border-primary cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            value={zoneFilter}
            onChange={e => setZoneFilter(e.target.value)}
            className="h-8 px-2.5 rounded-md bg-panel-bg border border-border text-xs font-semibold text-foreground outline-none focus:border-primary cursor-pointer"
          >
            <option value="all">All Zones ({zones.length})</option>
            {zones.map(z => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>

          {(search || statusFilter !== 'all' || cutoffFilter !== 'all' || zoneFilter !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
                setCutoffFilter('all');
                setZoneFilter('all');
              }}
              className="text-xs font-semibold text-primary hover:underline ml-auto cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: CUTOFF SUMMARIES VIEW */}
      {activeTab === 'summaries' && (
        <div className="space-y-3">
          {loading ? (
            <div className="py-16 text-center bg-white border border-border rounded-xl space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
              <p className="text-xs text-muted-foreground">Loading historical payroll cutoffs...</p>
            </div>
          ) : cutoffGroups.length === 0 ? (
            <div className="py-16 text-center bg-white border border-border rounded-xl text-xs text-muted-foreground italic">
              No historical payroll cutoffs match the current filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {cutoffGroups.map(group => (
                <div
                  key={group.cutoffKey}
                  className="bg-white border border-border hover:border-primary/40 rounded-xl p-4 md:p-5 shadow-sm transition space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center text-primary shrink-0">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-foreground">
                          {group.label}
                        </h3>
                        <p className="text-[11px] text-muted-foreground">
                          Period: {group.cutoffStart} to {group.cutoffEnd} &bull; {group.recordCount} Rider Worksheets
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedCutoffGroup(group);
                          setIsDrawerOpen(true);
                        }}
                        className="h-8 px-3 rounded-lg bg-primary text-white hover:bg-primary-hover transition text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View Read-Only Details
                      </button>

                      <div className="relative group">
                        <button className="h-8 px-3 rounded-lg bg-panel-bg border border-border text-foreground hover:bg-accent transition text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                          <Download className="w-3.5 h-3.5 text-muted-foreground" />
                          Export ▾
                        </button>
                        <div className="absolute right-0 mt-1 w-36 bg-white border border-border rounded-lg shadow-lg hidden group-hover:block z-20 py-1 text-xs">
                          <button
                            onClick={() => handleExportCutoff(group, 'pdf')}
                            className="w-full text-left px-3 py-1.5 hover:bg-panel-bg cursor-pointer"
                          >
                            Export PDF Summary
                          </button>
                          <button
                            onClick={() => handleExportCutoff(group, 'xlsx')}
                            className="w-full text-left px-3 py-1.5 hover:bg-panel-bg cursor-pointer"
                          >
                            Export XLSX Sheet
                          </button>
                          <button
                            onClick={() => handleExportCutoff(group, 'csv')}
                            className="w-full text-left px-3 py-1.5 hover:bg-panel-bg cursor-pointer"
                          >
                            Export CSV File
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Cutoff Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                    <div className="p-2.5 rounded-lg bg-panel-bg border border-border">
                      <span className="text-[10.5px] uppercase font-bold text-muted-foreground block">Parcels Delivered</span>
                      <span className="font-extrabold text-foreground">{group.totalParcels.toLocaleString()} pcs</span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-panel-bg border border-border">
                      <span className="text-[10.5px] uppercase font-bold text-muted-foreground block">Gross Accrued</span>
                      <span className="font-extrabold text-foreground">{phpFmt(group.totalGross)}</span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-200">
                      <span className="text-[10.5px] uppercase font-bold text-emerald-800 block">Net Payroll</span>
                      <span className="font-extrabold text-emerald-950">{phpFmt(group.totalNet)}</span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-panel-bg border border-border">
                      <span className="text-[10.5px] uppercase font-bold text-muted-foreground block">Status Mix</span>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-semibold">
                        {Object.entries(group.statusCount).map(([st, cnt]) => (
                          <span key={st} className="uppercase px-1.5 py-0.2 rounded bg-white border border-border text-[10px]">
                            {st}: {cnt}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DETAILED RIDER RECORDS VIEW */}
      {activeTab === 'records' && (
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="table-scroll-region" role="region" aria-label="Historical payroll records" tabIndex={0}>
            <table className="data-table-extra-wide w-full text-left text-xs">
              <thead className="bg-panel-bg border-b border-border text-muted-foreground uppercase font-bold text-[10.5px] tracking-wider">
                <tr>
                  <th className="p-3.5">Rider Info</th>
                  <th className="p-3.5">Cutoff Period</th>
                  <th className="p-3.5 text-right">Standard</th>
                  <th className="p-3.5 text-right">Heavy</th>
                  <th className="p-3.5 text-right">Gross Delivery</th>
                  <th className="p-3.5 text-right">Deductions</th>
                  <th className="p-3.5 text-right">Net Payable</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1 text-primary" />
                      Loading rider records...
                    </td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground italic">
                      No rider payroll records found.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map(r => {
                    const calculated = calculatePayrollRecordTotals(r);
                    const net = calculated.netPay;
                    const deduct = calculated.totalDeductions;

                    return (
                      <tr key={r.id} className="hover:bg-panel-bg/60 transition">
                        <td className="p-3.5 font-semibold text-foreground">
                          <div>{r.riders?.name || 'Rider'}</div>
                          <div className="text-[10.5px] text-muted-foreground font-mono">
                            {r.riders?.mkb_id} &bull; {r.riders?.zones?.name || 'Unassigned'}
                          </div>
                        </td>
                        <td className="p-3.5 font-mono text-muted-foreground">
                          {r.cutoff_start} to {r.cutoff_end}
                        </td>
                        <td className="p-3.5 text-right font-extrabold text-foreground">
                          {Number(r.standard_parcels ?? r.total_parcels ?? 0)} pcs
                        </td>
                        <td className="p-3.5 text-right font-extrabold text-primary">
                          {Number(r.heavy_parcels ?? 0)} pcs
                        </td>
                        <td className="p-3.5 text-right font-semibold text-foreground">
                          {phpFmt(r.gross_pay || 0)}
                        </td>
                        <td className="p-3.5 text-right font-semibold text-red-600">
                          {deduct > 0 ? `-${phpFmt(deduct)}` : '₱0.00'}
                        </td>
                        <td className="p-3.5 text-right font-extrabold text-emerald-700">
                          {phpFmt(net)}
                        </td>
                        <td className="p-3.5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${r.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : r.status === 'approved' ? 'bg-sky-50 text-sky-700 border border-sky-200' : r.status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                            {r.status || 'DRAFT'}
                          </span>
                          {Number(r.calculation_version ?? 1) === 1 && (
                            <span className="ml-1 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-600">Legacy snapshot</span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => {
                              setSelectedRiderRecord(r);
                              setIsPayslipModalOpen(true);
                            }}
                            className="h-7 px-2.5 rounded-md bg-accent text-primary hover:bg-primary hover:text-white transition text-xs font-semibold flex items-center gap-1 mx-auto cursor-pointer"
                          >
                            <Printer className="w-3 h-3" />
                            Payslip
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CUTOFF COMPARISON MATRIX TOOL */}
      {activeTab === 'compare' && (
        <div className="bg-white border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="border-b border-border pb-3">
            <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" />
              Side-by-Side Cutoff Comparison Tool
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select two historical cutoff periods to analyze variance in parcel volumes, gross earnings, and net payroll.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">
                Select Cutoff A (Base Cutoff):
              </label>
              <select
                value={compareCutoffA}
                onChange={e => setCompareCutoffA(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-panel-bg border border-border text-xs font-semibold text-foreground outline-none focus:border-primary cursor-pointer"
              >
                {distinctCutoffs.map(c => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">
                Select Cutoff B (Comparison Cutoff):
              </label>
              <select
                value={compareCutoffB}
                onChange={e => setCompareCutoffB(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-panel-bg border border-border text-xs font-semibold text-foreground outline-none focus:border-primary cursor-pointer"
              >
                {distinctCutoffs.map(c => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {comparisonData && (
            <div className="pt-3 border-t border-border space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-panel-bg border border-border space-y-1">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase">Parcel Volume Variance</span>
                  <div className="text-xl font-black text-foreground flex items-center gap-2">
                    {comparisonData.parcelsDiff >= 0 ? '+' : ''}{comparisonData.parcelsDiff.toLocaleString()} pcs
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${comparisonData.parcelsDiff >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                      {comparisonData.parcelsPct}%
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-panel-bg border border-border space-y-1">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase">Gross Accrued Variance</span>
                  <div className="text-xl font-black text-foreground">
                    {comparisonData.grossDiff >= 0 ? '+' : ''}{phpFmt(comparisonData.grossDiff)}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-1">
                  <span className="text-[11px] font-bold text-emerald-800 uppercase">Net Disbursed Variance</span>
                  <div className="text-xl font-black text-emerald-950 flex items-center gap-2">
                    {comparisonData.netDiff >= 0 ? '+' : ''}{phpFmt(comparisonData.netDiff)}
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${comparisonData.netDiff >= 0 ? 'bg-emerald-200 text-emerald-900' : 'bg-red-200 text-red-900'}`}>
                      {comparisonData.netPct}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* READ-ONLY CUTOFF DETAILS DRAWER */}
      <RightDrawer
        open={isDrawerOpen && Boolean(selectedCutoffGroup)}
        onClose={() => setIsDrawerOpen(false)}
        ariaLabel={selectedCutoffGroup ? `Payroll cutoff archive ${selectedCutoffGroup.label}` : 'Payroll cutoff archive'}
        widthClassName="max-w-2xl"
        panelClassName="overflow-y-auto"
        closeLabel="Close payroll archive drawer"
      >
        {selectedCutoffGroup && (
          <>
              {/* Drawer Header */}
              <div className="p-5 border-b border-border bg-panel-bg flex items-center justify-between sticky top-0 z-10">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-accent text-primary">
                      Read-Only Cutoff Archive
                    </span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Finalized
                    </span>
                  </div>
                  <h2 className="text-base font-extrabold text-foreground">
                    {selectedCutoffGroup.label}
                  </h2>
                </div>

                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-white text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Drawer Content */}
              <div className="p-5 space-y-5 flex-1">
                {/* Banner */}
                <div className="p-3.5 rounded-xl bg-accent/40 border border-primary/20 flex items-start gap-2.5 text-xs text-primary leading-relaxed">
                  <Lock className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
                  <div>
                    <span className="font-bold block">Archive Mode Active</span>
                    This historical cutoff is strictly read-only. Data cannot be edited or modified.
                  </div>
                </div>

                {/* Rider Worksheets List in Drawer */}
                <div className="space-y-3">
                  <h3 className="text-xs font-extrabold text-foreground uppercase tracking-wider">
                    Rider Worksheets ({selectedCutoffGroup.records.length})
                  </h3>

                  <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
                    {selectedCutoffGroup.records.map(r => (
                      <div key={r.id} className="p-3.5 flex items-center justify-between hover:bg-panel-bg/50 transition text-xs">
                        <div>
                          <span className="font-extrabold text-foreground block">{r.riders?.name}</span>
                          <span className="text-[10.5px] text-muted-foreground font-mono">{r.riders?.mkb_id} &bull; {r.total_parcels} pcs</span>
                        </div>
                        <div className="text-right">
                          <span className="font-extrabold text-emerald-700 block">{phpFmt(computeNetPay(r))}</span>
                          <button
                            onClick={() => {
                              setSelectedRiderRecord(r);
                              setIsPayslipModalOpen(true);
                            }}
                            className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                          >
                            Reprint Payslip →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
          </>
        )}
      </RightDrawer>

      {/* READ-ONLY PAYSLIP PREVIEW MODAL */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isPayslipModalOpen && selectedRiderRecord && (
          <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="viewport-dialog w-full max-w-lg space-y-4 rounded-xl border border-border bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-6"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Printer className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-extrabold text-foreground">
                    Historical Payslip Preview
                  </h3>
                </div>
                <button
                  onClick={() => setIsPayslipModalOpen(false)}
                  className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-panel-bg text-muted-foreground cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Payslip Header */}
              <div className="p-4 rounded-xl bg-panel-bg border border-border space-y-2 text-xs">
                <div className="flex justify-between font-extrabold text-foreground text-sm">
                  <span>{selectedRiderRecord.riders?.name}</span>
                  <span className="text-primary font-mono">{selectedRiderRecord.riders?.mkb_id}</span>
                </div>
                <div className="text-muted-foreground text-[11px]">
                  Cutoff: {selectedRiderRecord.cutoff_start} to {selectedRiderRecord.cutoff_end}
                </div>
              </div>

              {/* Immutable workflow actor snapshots */}
              <div className="rounded-xl border border-border bg-white p-3 text-[10px]">
                <div className="mb-2 font-bold uppercase tracking-wider text-muted-foreground">
                  Workflow Attribution
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {selectedRiderRecord.submitted_at && (
                    <div>
                      <div className="mb-1 font-bold text-foreground">Submitted</div>
                      <PayrollActorIdentity
                        snapshotName={selectedRiderRecord.submitted_by_name_snapshot}
                        snapshotEmail={selectedRiderRecord.submitted_by_email_snapshot}
                        currentName={selectedRiderRecord.submitted_user?.full_name}
                        currentEmail={selectedRiderRecord.submitted_user?.email}
                        legacyFallbackLabel="Payroll Officer"
                      />
                      <div className="mt-1 text-muted-foreground">{new Date(selectedRiderRecord.submitted_at).toLocaleString()}</div>
                    </div>
                  )}
                  {selectedRiderRecord.approved_at && (
                    <div>
                      <div className="mb-1 font-bold text-foreground">Approved</div>
                      <PayrollActorIdentity
                        snapshotName={selectedRiderRecord.approved_by_name_snapshot}
                        snapshotEmail={selectedRiderRecord.approved_by_email_snapshot}
                        currentName={selectedRiderRecord.approved_user?.full_name}
                        currentEmail={selectedRiderRecord.approved_user?.email}
                        legacyFallbackLabel="Admin / HR"
                      />
                      <div className="mt-1 text-muted-foreground">{new Date(selectedRiderRecord.approved_at).toLocaleString()}</div>
                    </div>
                  )}
                  {selectedRiderRecord.rejected_at && (
                    <div>
                      <div className="mb-1 font-bold text-rose-700">Rejected</div>
                      <PayrollActorIdentity
                        snapshotName={selectedRiderRecord.rejected_by_name_snapshot}
                        snapshotEmail={selectedRiderRecord.rejected_by_email_snapshot}
                        currentName={selectedRiderRecord.rejected_user?.full_name}
                        currentEmail={selectedRiderRecord.rejected_user?.email}
                        legacyFallbackLabel="Admin / HR"
                        tone="danger"
                      />
                      <div className="mt-1 text-muted-foreground">{new Date(selectedRiderRecord.rejected_at).toLocaleString()}</div>
                    </div>
                  )}
                  {selectedRiderRecord.returned_at && (
                    <div>
                      <div className="mb-1 font-bold text-amber-700">Returned for Revision</div>
                      <PayrollActorIdentity
                        snapshotName={selectedRiderRecord.returned_by_name_snapshot}
                        snapshotEmail={selectedRiderRecord.returned_by_email_snapshot}
                        currentName={selectedRiderRecord.returned_user?.full_name}
                        currentEmail={selectedRiderRecord.returned_user?.email}
                        legacyFallbackLabel="Admin / HR"
                      />
                      <div className="mt-1 text-muted-foreground">{new Date(selectedRiderRecord.returned_at).toLocaleString()}</div>
                    </div>
                  )}
                  {selectedRiderRecord.paid_at && (
                    <div>
                      <div className="mb-1 font-bold text-emerald-700">Marked Paid</div>
                      <PayrollActorIdentity
                        snapshotName={selectedRiderRecord.paid_by_name_snapshot}
                        snapshotEmail={selectedRiderRecord.paid_by_email_snapshot}
                        currentName={selectedRiderRecord.paid_user?.full_name}
                        currentEmail={selectedRiderRecord.paid_user?.email}
                        legacyFallbackLabel="Admin / HR"
                        tone="success"
                      />
                      <div className="mt-1 text-muted-foreground">{new Date(selectedRiderRecord.paid_at).toLocaleString()}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Earnings Breakdown */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between border-b border-border pb-1">
                  <span className="text-muted-foreground">Standard Delivered:</span>
                  <span className="font-bold text-foreground">{Number(selectedRiderRecord.standard_parcels ?? selectedRiderRecord.total_parcels ?? 0)} pcs</span>
                </div>
                <div className="flex justify-between border-b border-border pb-1">
                  <span className="text-muted-foreground">Heavy Delivered:</span>
                  <span className="font-bold text-primary">{Number(selectedRiderRecord.heavy_parcels ?? 0)} pcs</span>
                </div>
                <div className="flex justify-between border-b border-border pb-1">
                  <span className="text-muted-foreground">Standard Earnings:</span>
                  <span className="font-bold text-foreground">{phpFmt(Number(selectedRiderRecord.standard_earnings ?? selectedRiderRecord.gross_pay ?? 0))}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-1">
                  <span className="text-muted-foreground">Heavy Earnings:</span>
                  <span className="font-bold text-primary">{phpFmt(Number(selectedRiderRecord.heavy_earnings ?? 0))}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-1">
                  <span className="text-muted-foreground">Gross Base Pay:</span>
                  <span className="font-bold text-foreground">{phpFmt(selectedRiderRecord.gross_pay || 0)}</span>
                </div>
                {Number(payslipAdjustmentsFromRecord(selectedRiderRecord).fmPickupAmount || 0) > 0 && (
                  <div className="flex justify-between border-b border-border pb-1 text-emerald-700">
                    <span>{payslipAdjustmentsFromRecord(selectedRiderRecord).definitions?.find((item) => item.code === 'fm_pickup')?.label || 'FM Pick Up'}:</span>
                    <span className="font-bold">+₱{calculatePayrollRecordTotals(selectedRiderRecord).fmPickupEarnings}</span>
                  </div>
                )}
                {Number(selectedRiderRecord.other_earnings || 0) > 0 && (
                  <div className="flex justify-between border-b border-border pb-1 text-emerald-700">
                    <span>{payslipAdjustmentsFromRecord(selectedRiderRecord).definitions?.find((item) => item.code === 'other_earnings')?.label || 'Other Earnings'}:</span>
                    <span className="font-bold">+₱{selectedRiderRecord.other_earnings}</span>
                  </div>
                )}
                {calculatePayrollRecordTotals(selectedRiderRecord).totalDeductions > 0 && (
                  <div className="flex justify-between border-b border-border pb-1 text-red-600">
                    <span>Total Deductions / Penalties:</span>
                    <span className="font-bold">-{phpFmt(calculatePayrollRecordTotals(selectedRiderRecord).totalDeductions)}</span>
                  </div>
                )}

                <div className="flex justify-between text-sm font-black pt-2 border-t border-border text-emerald-800">
                  <span>NET PAYABLE:</span>
                  <span>{phpFmt(computeNetPay(selectedRiderRecord))}</span>
                </div>
              </div>

              {/* Action Footer */}
              <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <button
                  onClick={() => printParcelPayslipDocument(historicalRecordToPayslipDocumentData(selectedRiderRecord))}
                  className="h-9 px-4 rounded-lg bg-primary text-white hover:bg-primary-hover transition text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Payslip
                </button>
              </div>
            </motion.div>
          </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
