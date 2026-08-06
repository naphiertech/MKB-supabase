import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Lock,
  ChevronRight,
  ChevronLeft,
  Search,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Loader2,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import {
  getPaginatedPayrollRecords,
  bulkSubmitPayrollForApproval,
  deletePayrollRecord,
  deleteBulkPayrollRecords
} from '../../services/parcelService';
import { getZones } from '../../services/geofenceService';
import type { Zone } from '../../services/types';
import { useAuth } from '../../hooks/useAuth';
import { pushToast } from '../../hooks/useToast';
import { PayrollStatus, PayrollStatusLabels, PayrollStatusColors, isEditableStatus } from '../../types/payroll';

function phpFmt(val: number) {
  return '₱' + val.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(isoString: string) {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

function formatCutoff(startStr: string, endStr: string) {
  try {
    const s = new Date(startStr);
    const e = new Date(endStr);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return '—';
    const month = s.toLocaleDateString('en-US', { month: 'short' });
    return `${month} ${s.getDate()}–${e.getDate()}`;
  } catch {
    return '—';
  }
}

function StatusPill({ status }: { status: string }) {
  const lower = (status || '').toLowerCase() as PayrollStatus;
  const color = PayrollStatusColors[lower] || PayrollStatusColors[PayrollStatus.PENDING];
  const label = PayrollStatusLabels[lower] || status;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${color}`}>
      {label}
    </span>
  );
}

export interface PayrollRecordRow {
  id: string;
  rider_id: string;
  cutoff_start: string;
  cutoff_end: string;
  total_parcels: number;
  rate_per_parcel: number | null;
  gross_pay: number | null;
  standard_parcels?: number | null;
  heavy_parcels?: number | null;
  standard_earnings?: number | null;
  heavy_earnings?: number | null;
  rate_configuration_id?: string | null;
  calculation_version?: number | null;
  snapshot_finalized_at?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  other_earnings?: number;
  fm_pickup_count?: number;
  deductions?: number;
  late_onhold?: number;
  late_remittance?: number;
  submitted_by?: string;
  submitted_at?: string;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  rejection_reason?: string;
  paid_by?: string;
  paid_at?: string;
  submitted_user?: { full_name: string } | null;
  approved_user?: { full_name: string } | null;
  rejected_user?: { full_name: string } | null;
  paid_user?: { full_name: string } | null;
  riders: {
    id?: string;
    name: string;
    mkb_id: string;
    notes: string | null;
    zones: { name: string } | null;
  } | null;
}

interface RiderPayrollListProps {
  cutoffFrom: string;
  cutoffTo: string;
  role: 'admin' | 'hr' | 'payroll';
  reloadTrigger: number;
  onStatusUpdated?: () => void;
  onComputeRider?: (record: PayrollRecordRow) => void;
  onOpenDetails: (record: PayrollRecordRow, allRecordsInPage: PayrollRecordRow[]) => void;
}

export function RiderPayrollList({
  cutoffFrom,
  cutoffTo,
  role,
  reloadTrigger,
  onStatusUpdated,
  onComputeRider,
  onOpenDetails
}: RiderPayrollListProps) {
  const isAdminOrHr = role === 'admin' || role === 'hr';
  const { user } = useAuth();
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [layoutReady, setLayoutReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<PayrollRecordRow | null>(null);
  const [confirmSingleDeleteOpen, setConfirmSingleDeleteOpen] = useState(false);
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSingleDelete = async () => {
    if (!recordToDelete) return;
    setDeleting(true);
    try {
      await deletePayrollRecord(recordToDelete.id);
      pushToast({
        title: "Record Deleted",
        description: `Deleted payroll record for ${recordToDelete.riders?.name || 'Rider'}.`,
        tone: "info"
      });
      setConfirmSingleDeleteOpen(false);
      setRecordToDelete(null);
      fetchRecords();
      if (onStatusUpdated) onStatusUpdated();
    } catch (err: unknown) {
      console.error("Failed to delete record:", err);
      const msg = err instanceof Error ? err.message : "Failed to delete payroll record.";
      pushToast({
        title: "Delete Failed",
        description: msg,
        tone: "error"
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRecordIds.size === 0) return;
    setDeleting(true);
    try {
      const count = await deleteBulkPayrollRecords(Array.from(selectedRecordIds));
      pushToast({
        title: "Records Deleted",
        description: `Deleted ${count} selected payroll record(s).`,
        tone: "info"
      });
      setSelectedRecordIds(new Set());
      setConfirmBulkDeleteOpen(false);
      fetchRecords();
      if (onStatusUpdated) onStatusUpdated();
    } catch (err: unknown) {
      console.error("Failed to delete selected records:", err);
      const msg = err instanceof Error ? err.message : "Failed to delete selected payroll records.";
      pushToast({
        title: "Bulk Delete Failed",
        description: msg,
        tone: "error"
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (selectedRecordIds.size === 0) return;
    setSubmitting(true);
    try {
      const selectedRecords = payrollRecords.filter(r => selectedRecordIds.has(r.id));
      // Validate they are in draft or rejected status
      const invalidRecords = selectedRecords.filter(r => !isEditableStatus(r.status));
      if (invalidRecords.length > 0) {
        pushToast({
          title: "Invalid Status Detected",
          description: "Only Draft or Rejected payroll records can be submitted for approval.",
          tone: "warning"
        });
        setSubmitting(false);
        return;
      }

      const recordIds = Array.from(selectedRecordIds);
      const userId = user?.id || '';
      await bulkSubmitPayrollForApproval(recordIds, userId);

      pushToast({
        title: "Submitted for Approval",
        description: `Successfully submitted ${recordIds.length} payroll record(s).`,
        tone: "success"
      });

      setSelectedRecordIds(new Set());
      if (onStatusUpdated) {
        onStatusUpdated();
      }
    } catch (err: unknown) {
      console.error("Bulk submission failed:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      pushToast({
        title: "Submission failed",
        description: errMsg || "An error occurred while submitting payrolls for approval.",
        tone: "error"
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Wait for web fonts and layout transitions to settle before fetching data
  useEffect(() => {
    let active = true;
    const initLayout = async () => {
      if (typeof document !== 'undefined' && 'fonts' in document) {
        try {
          await document.fonts.ready;
        } catch (err) {
          console.warn('Font loading check failed:', err);
        }
      }
      // Wait a micro-frame for parent containers to paint
      requestAnimationFrame(() => {
        if (active) {
          setLayoutReady(true);
        }
      });
    };
    initLayout();
    return () => {
      active = false;
    };
  }, []);

  // Pagination states
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  // Search states
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Filter states
  const [statusFilter, setStatusFilter] = useState('all');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [allZones, setAllZones] = useState<Zone[]>([]);

  // Sorting states
  const [sortBy, setSortBy] = useState<'riderName' | 'total_parcels' | 'gross_pay' | 'net_pay' | 'status'>('riderName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Multi-select state
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());

  // Search Debounce Effect
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset page on new search
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Load Zones List for Filter
  useEffect(() => {
    async function loadZones() {
      try {
        const zonesData = await getZones();
        setAllZones(zonesData);
      } catch (err) {
        console.error('Failed to load zones for filters', err);
      }
    }
    loadZones();
  }, []);

  // Reset page when filters or date cutoff change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, zoneFilter, cutoffFrom, cutoffTo]);

  // Load paginated records from Supabase
  const fetchRecords = useCallback(async () => {
    if (!layoutReady) return;

    setLoading(true);
    try {
      const { records, totalCount: count } = await getPaginatedPayrollRecords({
        cutoffFrom,
        cutoffTo,
        page,
        pageSize,
        search: debouncedSearch,
        statusFilter,
        zoneFilter,
        sortBy,
        sortOrder
      });

      // Client-side sort fallback for net_pay since database ordering was gross_pay
      const sortedRecords = [...records];
      if (sortBy === 'net_pay') {
        sortedRecords.sort((a, b) => {
          const getNet = (r: PayrollRecordRow) => {
            const gross = r.gross_pay ?? 0;
            const other = Number(r.other_earnings ?? 0);
            const fm = Number(r.fm_pickup_count ?? 0) * 3;
            const deduct = Number(r.deductions ?? 0) + Number(r.late_onhold ?? 0) + Number(r.late_remittance ?? 0);
            return gross + other + fm - deduct;
          };
          const netA = getNet(a);
          const netB = getNet(b);
          return sortOrder === 'asc' ? netA - netB : netB - netA;
        });
      }

      setPayrollRecords(sortedRecords);
      setTotalCount(count);
    } catch (err) {
      console.error('Failed to load payroll records', err);
    } finally {
      setLoading(false);
    }
  }, [cutoffFrom, cutoffTo, page, pageSize, debouncedSearch, statusFilter, zoneFilter, sortBy, sortOrder, layoutReady]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords, reloadTrigger]);

  // Sorting handlers
  const handleSort = (column: 'riderName' | 'total_parcels' | 'gross_pay' | 'net_pay' | 'status') => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1); // Reset page on new sort
  };

  const renderSortIcon = (column: 'riderName' | 'total_parcels' | 'gross_pay' | 'net_pay' | 'status') => {
    if (sortBy !== column) return <ArrowUpDown className="w-3 h-3 text-subtle-text transition-colors ml-1.5 shrink-0 opacity-40 group-hover:opacity-100" />;
    return sortOrder === 'asc' 
      ? <ChevronUp className="w-3.5 h-3.5 text-primary ml-1.5 shrink-0" />
      : <ChevronDown className="w-3.5 h-3.5 text-primary ml-1.5 shrink-0" />;
  };

  // Multi-select handlers
  const handleToggleSelectAll = () => {
    if (selectedRecordIds.size === payrollRecords.length && payrollRecords.length > 0) {
      setSelectedRecordIds(new Set());
    } else {
      setSelectedRecordIds(new Set(payrollRecords.map(r => r.id)));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    const next = new Set(selectedRecordIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedRecordIds(next);
  };

  const cutoffLabel = useMemo(() => {
    try {
      const start = new Date(cutoffFrom);
      const end = new Date(cutoffTo);
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${end.getDate()}`;
    } catch {
      return 'Cutoff';
    }
  }, [cutoffFrom, cutoffTo]);

  return (
    <div className="space-y-4">
      {/* Bulk Actions Banner */}
      {selectedRecordIds.size > 0 && (
        <div className="p-3 px-4 rounded-xl border border-primary/30 bg-accent/50 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold">
              {selectedRecordIds.size}
            </span>
            <span className="text-xs font-semibold text-accent-foreground">
              Riders selected for bulk actions
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled
              className="h-8 px-3 rounded-lg border border-border bg-white/50 text-subtle-text text-xs font-semibold cursor-not-allowed"
              title="Bulk export is not yet available"
            >
              Bulk Export — Not yet available
            </button>
            {role === 'payroll' ? (
              <>
                <button
                  onClick={handleSubmitForApproval}
                  disabled={submitting || deleting}
                  className="h-8 px-3 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold transition inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit for Approval'
                  )}
                </button>
                <button
                  onClick={() => setConfirmBulkDeleteOpen(true)}
                  disabled={submitting || deleting}
                  className="h-8 px-3 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold transition inline-flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                  title="Delete selected draft records"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Selected ({selectedRecordIds.size})
                </button>
              </>
            ) : (
              <>
                <button
                  disabled
                  className="h-8 px-3 rounded-lg border border-border bg-white/50 text-subtle-text text-xs font-semibold cursor-not-allowed"
                  title="Bulk approval is not yet available"
                >
                  Bulk Approve — Not yet available
                </button>
                <button
                  disabled
                  className="h-8 px-3 rounded-lg bg-primary/40 text-white text-xs font-semibold cursor-not-allowed"
                  title="Bulk payment is not yet available"
                >
                  Bulk Pay — Not yet available
                </button>
              </>
            )}
            <button 
              onClick={() => setSelectedRecordIds(new Set())}
              className="h-8 px-2.5 text-muted-foreground hover:text-foreground text-xs font-semibold transition"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Main Table Container */}
      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Rider Payroll List</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-panel-bg border border-border text-[9px] font-medium text-muted-foreground">
                <Lock className="w-2.5 h-2.5" /> Read-only
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
              {totalCount} records · {cutoffLabel} · Click rows or chevron to inspect daily breakdowns
            </div>
          </div>
        </div>

        {/* Table Control Bar */}
        <div className="px-5 py-3 border-b border-border bg-panel-bg/50 flex flex-col md:flex-row items-center gap-3 justify-between">
          {/* Search Input */}
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-subtle-text" />
            <input
              type="text"
              placeholder="Search rider name, ID, zone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 h-9 rounded-lg bg-white border border-border text-xs text-foreground placeholder:text-subtle-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-3 top-2 text-xs font-semibold text-subtle-text hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-end">
            {/* Zone Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Zone:</span>
              <select
                value={zoneFilter}
                onChange={e => setZoneFilter(e.target.value)}
                className="h-9 px-2.5 rounded-lg bg-white border border-border text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 cursor-pointer"
              >
                <option value="all">All Zones</option>
                {allZones.map(z => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Status:</span>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="h-9 px-2.5 rounded-lg bg-white border border-border text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 cursor-pointer font-mono text-[11px]"
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="pending">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="paid">Paid</option>
                <option value="flagged">Flagged</option>
              </select>
            </div>
          </div>
        </div>

        {loading && (
          <div className="p-10 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading cutoff statistics from Supabase...</span>
          </div>
        )}

        {!loading && payrollRecords.length === 0 && (
          <div className="p-12 text-center space-y-2">
            <div className="text-sm font-semibold text-foreground">
              No payroll records computed for {cutoffLabel} yet.
            </div>
            {role === 'payroll' ? (
              <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                Use <span className="font-semibold text-primary">&ldquo;Initialize Fleet Cutoff&rdquo;</span> above to generate draft records for all active riders, or <span className="font-semibold text-foreground">&ldquo;Search & Pick Rider&rdquo;</span> to log daily parcels individually.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                No payroll records have been initialized or submitted for this cutoff period yet.
              </p>
            )}
          </div>
        )}

        {!loading && payrollRecords.length > 0 && (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
            <table className="w-full text-sm">
              <thead className="bg-panel-bg border-b border-border sticky top-0 z-10 shadow-sm">
                <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
                  <th className="px-5 py-3 w-32 bg-panel-bg">
                    <div className="flex items-center justify-center gap-2">
                      <input
                        type="checkbox"
                        checked={payrollRecords.length > 0 && selectedRecordIds.size === payrollRecords.length}
                        onChange={handleToggleSelectAll}
                        className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer accent-primary"
                      />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('riderName')}
                    className="px-3 py-3 cursor-pointer hover:bg-panel-bg group transition-colors bg-panel-bg"
                  >
                    <div className="flex items-center">
                      Rider {renderSortIcon('riderName')}
                    </div>
                  </th>
                  {isAdminOrHr && <th className="px-3 py-3 bg-panel-bg whitespace-nowrap">Rider ID</th>}
                  <th className="px-3 py-3 bg-panel-bg">Zone</th>
                  {isAdminOrHr && <th className="px-3 py-3 bg-panel-bg whitespace-nowrap">Cutoff</th>}
                  {!isAdminOrHr && (
                    <th 
                      onClick={() => handleSort('total_parcels')}
                      className="px-3 py-3 text-right cursor-pointer hover:bg-panel-bg group transition-colors bg-panel-bg whitespace-nowrap"
                    >
                      <div className="flex items-center justify-end">
                        Parcels {renderSortIcon('total_parcels')}
                      </div>
                    </th>
                  )}
                  {!isAdminOrHr && <th className="px-3 py-3 text-right bg-panel-bg whitespace-nowrap">Rate</th>}
                  <th 
                    onClick={() => handleSort('gross_pay')}
                    className="px-3 py-3 text-right cursor-pointer hover:bg-panel-bg group transition-colors bg-panel-bg whitespace-nowrap"
                  >
                    <div className="flex items-center justify-end">
                      Gross Pay {renderSortIcon('gross_pay')}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('net_pay')}
                    className="px-3 py-3 text-right cursor-pointer hover:bg-panel-bg group transition-colors bg-panel-bg whitespace-nowrap"
                  >
                    <div className="flex items-center justify-end">
                      Net Pay {renderSortIcon('net_pay')}
                    </div>
                  </th>
                  {isAdminOrHr && <th className="px-3 py-3 bg-panel-bg whitespace-nowrap">Submitted By</th>}
                  {isAdminOrHr && <th className="px-3 py-3 bg-panel-bg whitespace-nowrap">Submitted Date</th>}
                  <th 
                    onClick={() => handleSort('status')}
                    className="px-3 py-3 pr-5 cursor-pointer hover:bg-panel-bg group transition-colors bg-panel-bg whitespace-nowrap"
                  >
                    <div className="flex items-center">
                      Status {renderSortIcon('status')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {payrollRecords.map(r => {
                  const riderName = r.riders?.name || 'Unknown Rider';
                  const riderId = r.riders?.mkb_id || 'MKB-RIDER';
                  const zone = r.riders?.zones?.name || '—';
                  const ratePerParcel = r.rate_per_parcel;

                  const grossPay = r.gross_pay ?? 0;
                  const otherEarnings = Number(r.other_earnings ?? 0);
                  const fmPickupPay = Number(r.fm_pickup_count ?? 0) * 3;
                  const totalDeductions = Number(r.deductions ?? 0) + Number(r.late_onhold ?? 0) + Number(r.late_remittance ?? 0);
                  const netPay = grossPay + otherEarnings + fmPickupPay - totalDeductions;

                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => onOpenDetails(r, payrollRecords)}
                        className={`border-b border-border cursor-pointer transition hover:bg-accent/20`}
                      >
                        <td className="px-5 py-3 relative" onClick={e => e.stopPropagation()}>
                          {r.status === 'flagged' && (
                            <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-red-500" />
                          )}
                          <div className="flex items-center justify-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedRecordIds.has(r.id)}
                              onChange={() => handleToggleSelectRow(r.id)}
                              className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer accent-primary"
                            />
                            <ChevronRight className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
                            {onComputeRider && (
                              <button
                                onClick={() => onComputeRider(r)}
                                className={`px-2 py-0.5 text-[10px] font-bold rounded transition cursor-pointer ${
                                  isEditableStatus(r.status)
                                    ? 'bg-primary/10 hover:bg-primary hover:text-white text-primary'
                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                                }`}
                              >
                                {isEditableStatus(r.status) ? 'Compute' : 'View'}
                              </button>
                            )}
                            {isEditableStatus(r.status) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRecordToDelete(r);
                                  setConfirmSingleDeleteOpen(true);
                                }}
                                className="p-1 rounded text-subtle-text hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                                title="Delete this payroll record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-panel-bg border border-border flex items-center justify-center shrink-0">
                              <Users className="w-4 h-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold text-foreground truncate">{riderName}</div>
                              {!isAdminOrHr && <div className="text-[10.5px] font-mono text-muted-foreground">{riderId}</div>}
                            </div>
                          </div>
                        </td>
                        {isAdminOrHr && (
                          <td className="px-3 py-3 text-foreground font-mono text-xs whitespace-nowrap">{riderId}</td>
                        )}
                        <td className="px-3 py-3 text-foreground">{zone}</td>
                        {isAdminOrHr && (
                          <td className="px-3 py-3 text-muted-foreground text-xs whitespace-nowrap">
                            {formatCutoff(r.cutoff_start, r.cutoff_end)}
                          </td>
                        )}
                        {!isAdminOrHr && (
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-foreground whitespace-nowrap">
                            {r.total_parcels}
                          </td>
                        )}
                        {!isAdminOrHr && (
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                            {ratePerParcel == null ? (
                              <span className="font-sans text-[11px] font-semibold text-red-700">Rate missing</span>
                            ) : `₱${ratePerParcel.toFixed(2)}`}
                          </td>
                        )}
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                          {phpFmt(grossPay)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold text-primary whitespace-nowrap">
                          {phpFmt(netPay)}
                        </td>
                        {isAdminOrHr && (
                          <td className="px-3 py-3 text-foreground text-xs truncate max-w-[120px] whitespace-nowrap">
                            {r.submitted_user?.full_name || '—'}
                          </td>
                        )}
                        {isAdminOrHr && (
                          <td className="px-3 py-3 text-muted-foreground text-xs whitespace-nowrap">
                            {r.submitted_at ? formatDate(r.submitted_at) : '—'}
                          </td>
                        )}
                        <td className="px-3 py-3 pr-5 whitespace-nowrap">
                          <StatusPill status={r.status} />
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer Controls */}
        {!loading && payrollRecords.length > 0 && (
          <div className="px-5 py-3.5 border-t border-border bg-panel-bg/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span>Show:</span>
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-7 px-2.5 rounded border border-border bg-white text-xs outline-none cursor-pointer focus:border-primary"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>riders</span>
              </div>
              <span>
                Showing {totalCount === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} riders
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                className="h-8 px-2.5 rounded-lg border border-border bg-white hover:bg-panel-bg text-foreground font-semibold flex items-center justify-center gap-1 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Prev
              </button>
              <span className="font-medium text-foreground">
                Page {page} of {Math.max(Math.ceil(totalCount / pageSize), 1)}
              </span>
              <button
                disabled={page >= Math.ceil(totalCount / pageSize)}
                onClick={() => setPage(p => Math.min(p + 1, Math.ceil(totalCount / pageSize)))}
                className="h-8 px-2.5 rounded-lg border border-border bg-white hover:bg-panel-bg text-foreground font-semibold flex items-center justify-center gap-1 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal: Single Record Delete */}
      <AnimatePresence>
        {confirmSingleDeleteOpen && recordToDelete && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setConfirmSingleDeleteOpen(false);
                setRecordToDelete(null);
              }}
              className="absolute inset-0 bg-foreground/55 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white border border-border rounded-2xl p-6 shadow-2xl z-10 space-y-4 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Delete Payroll Record?</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {recordToDelete.riders?.name} ({recordToDelete.riders?.mkb_id || 'MKB-RIDER'})
                  </p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Are you sure you want to delete this payroll record? This action will remove the entry for this rider for the cutoff period.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmSingleDeleteOpen(false);
                    setRecordToDelete(null);
                  }}
                  className="px-4 h-9 rounded-lg border border-border hover:bg-panel-bg text-xs font-semibold text-foreground transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSingleDelete}
                  disabled={deleting}
                  className="px-5 h-9 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-bold text-white transition inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Yes, Delete Record'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal: Bulk Records Delete */}
      <AnimatePresence>
        {confirmBulkDeleteOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmBulkDeleteOpen(false)}
              className="absolute inset-0 bg-foreground/55 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white border border-border rounded-2xl p-6 shadow-2xl z-10 space-y-4 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Delete Selected Records?</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{selectedRecordIds.size} rider record(s) selected</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Are you sure you want to delete <strong className="text-foreground">{selectedRecordIds.size} selected payroll record(s)</strong>?
              </p>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmBulkDeleteOpen(false)}
                  className="px-4 h-9 rounded-lg border border-border hover:bg-panel-bg text-xs font-semibold text-foreground transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={deleting}
                  className="px-5 h-9 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-bold text-white transition inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    `Yes, Delete ${selectedRecordIds.size} Records`
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
