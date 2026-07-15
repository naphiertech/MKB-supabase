import { useState, useEffect, useMemo, Fragment } from 'react';
import {
  Users,
  Lock,
  ChevronRight,
  ChevronLeft,
  Search,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Loader2
} from 'lucide-react';
import { getPaginatedPayrollRecords, bulkSubmitPayrollForApproval } from '../../services/parcelService';
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
    } catch (err: any) {
      console.error("Bulk submission failed:", err);
      pushToast({
        title: "Submission failed",
        description: err.message || "An error occurred while submitting payrolls for approval.",
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
  useEffect(() => {
    if (!layoutReady) return;

    const loadData = async () => {
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
    };
    loadData();
  }, [cutoffFrom, cutoffTo, page, pageSize, debouncedSearch, statusFilter, zoneFilter, sortBy, sortOrder, reloadTrigger, layoutReady]);

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
    if (sortBy !== column) return <ArrowUpDown className="w-3 h-3 text-[#A39988] transition-colors ml-1.5 shrink-0 opacity-40 group-hover:opacity-100" />;
    return sortOrder === 'asc' 
      ? <ChevronUp className="w-3.5 h-3.5 text-[#db6c00] ml-1.5 shrink-0" />
      : <ChevronDown className="w-3.5 h-3.5 text-[#db6c00] ml-1.5 shrink-0" />;
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
        <div className="p-3 px-4 rounded-xl border border-[#db6c00]/30 bg-[#FFF1E0]/50 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#db6c00] text-white text-[10px] font-bold">
              {selectedRecordIds.size}
            </span>
            <span className="text-xs font-semibold text-[#b85a00]">
              Riders selected for bulk actions
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled
              className="h-8 px-3 rounded-lg border border-[#EFEAE2] bg-white/50 text-[#A39988] text-xs font-semibold cursor-not-allowed"
              title="Bulk Export coming soon"
            >
              Bulk Export
            </button>
            {role === 'payroll' ? (
              <button
                onClick={handleSubmitForApproval}
                disabled={submitting}
                className="h-8 px-3 rounded-lg bg-[#db6c00] hover:bg-[#b85a00] text-white text-xs font-semibold transition inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
            ) : (
              <>
                <button
                  disabled
                  className="h-8 px-3 rounded-lg border border-[#EFEAE2] bg-white/50 text-[#A39988] text-xs font-semibold cursor-not-allowed"
                  title="Bulk Approval coming soon"
                >
                  Bulk Approve
                </button>
                <button
                  disabled
                  className="h-8 px-3 rounded-lg bg-[#db6c00]/40 text-white text-xs font-semibold cursor-not-allowed"
                  title="Bulk Pay coming soon"
                >
                  Bulk Pay
                </button>
              </>
            )}
            <button 
              onClick={() => setSelectedRecordIds(new Set())}
              className="h-8 px-2.5 text-[#6B6258] hover:text-[#1A1410] text-xs font-semibold transition"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Main Table Container */}
      <div className="bg-white border border-[#EFEAE2] rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-[#EFEAE2] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#1A1410]">Rider Payroll List</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FAFAF7] border border-[#EFEAE2] text-[9px] font-medium text-[#6B6258]">
                <Lock className="w-2.5 h-2.5" /> Read-only
              </span>
            </div>
            <div className="text-[11px] text-[#6B6258] font-mono mt-0.5">
              {totalCount} records · {cutoffLabel} · Click rows or chevron to inspect daily breakdowns
            </div>
          </div>
        </div>

        {/* Table Control Bar */}
        <div className="px-5 py-3 border-b border-[#EFEAE2] bg-[#FAFAF7]/50 flex flex-col md:flex-row items-center gap-3 justify-between">
          {/* Search Input */}
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#A39988]" />
            <input
              type="text"
              placeholder="Search rider name, ID, zone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 h-9 rounded-lg bg-white border border-[#EFEAE2] text-xs text-[#1A1410] placeholder:text-[#A39988] outline-none focus:border-[#db6c00] focus:ring-2 focus:ring-[#db6c00]/15"
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-3 top-2 text-xs font-semibold text-[#A39988] hover:text-[#1A1410]"
              >
                Clear
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-end">
            {/* Zone Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-[#6B6258] font-bold">Zone:</span>
              <select
                value={zoneFilter}
                onChange={e => setZoneFilter(e.target.value)}
                className="h-9 px-2.5 rounded-lg bg-white border border-[#EFEAE2] text-xs text-[#1A1410] outline-none focus:border-[#db6c00] focus:ring-2 focus:ring-[#db6c00]/15 cursor-pointer"
              >
                <option value="all">All Zones</option>
                {allZones.map(z => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-[#6B6258] font-bold">Status:</span>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="h-9 px-2.5 rounded-lg bg-white border border-[#EFEAE2] text-xs text-[#1A1410] outline-none focus:border-[#db6c00] focus:ring-2 focus:ring-[#db6c00]/15 cursor-pointer font-mono text-[11px]"
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
            <Loader2 className="w-8 h-8 animate-spin text-[#db6c00]" />
            <span className="text-sm text-[#6B6258]">Loading cutoff statistics from Supabase...</span>
          </div>
        )}

        {!loading && payrollRecords.length === 0 && (
          <div className="p-16 text-center text-sm text-[#6B6258]">
            No payroll records found for this period. Click over to <strong>Computation</strong> to log parcels.
          </div>
        )}

        {!loading && payrollRecords.length > 0 && (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
            <table className="w-full text-sm">
              <thead className="bg-[#FAFAF7] border-b border-[#EFEAE2] sticky top-0 z-10 shadow-sm">
                <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-[#6B6258] font-semibold">
                  <th className="px-5 py-3 w-32 bg-[#FAFAF7]">
                    <div className="flex items-center justify-center gap-2">
                      <input
                        type="checkbox"
                        checked={payrollRecords.length > 0 && selectedRecordIds.size === payrollRecords.length}
                        onChange={handleToggleSelectAll}
                        className="rounded border-[#EFEAE2] text-[#db6c00] focus:ring-[#db6c00] h-3.5 w-3.5 cursor-pointer accent-[#db6c00]"
                      />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('riderName')}
                    className="px-3 py-3 cursor-pointer hover:bg-[#FAFAF7] group transition-colors bg-[#FAFAF7]"
                  >
                    <div className="flex items-center">
                      Rider {renderSortIcon('riderName')}
                    </div>
                  </th>
                  {isAdminOrHr && <th className="px-3 py-3 bg-[#FAFAF7] whitespace-nowrap">Rider ID</th>}
                  <th className="px-3 py-3 bg-[#FAFAF7]">Zone</th>
                  {isAdminOrHr && <th className="px-3 py-3 bg-[#FAFAF7] whitespace-nowrap">Cutoff</th>}
                  {!isAdminOrHr && (
                    <th 
                      onClick={() => handleSort('total_parcels')}
                      className="px-3 py-3 text-right cursor-pointer hover:bg-[#FAFAF7] group transition-colors bg-[#FAFAF7] whitespace-nowrap"
                    >
                      <div className="flex items-center justify-end">
                        Parcels {renderSortIcon('total_parcels')}
                      </div>
                    </th>
                  )}
                  {!isAdminOrHr && <th className="px-3 py-3 text-right bg-[#FAFAF7] whitespace-nowrap">Rate</th>}
                  <th 
                    onClick={() => handleSort('gross_pay')}
                    className="px-3 py-3 text-right cursor-pointer hover:bg-[#FAFAF7] group transition-colors bg-[#FAFAF7] whitespace-nowrap"
                  >
                    <div className="flex items-center justify-end">
                      Gross Pay {renderSortIcon('gross_pay')}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('net_pay')}
                    className="px-3 py-3 text-right cursor-pointer hover:bg-[#FAFAF7] group transition-colors bg-[#FAFAF7] whitespace-nowrap"
                  >
                    <div className="flex items-center justify-end">
                      Net Pay {renderSortIcon('net_pay')}
                    </div>
                  </th>
                  {isAdminOrHr && <th className="px-3 py-3 bg-[#FAFAF7] whitespace-nowrap">Submitted By</th>}
                  {isAdminOrHr && <th className="px-3 py-3 bg-[#FAFAF7] whitespace-nowrap">Submitted Date</th>}
                  <th 
                    onClick={() => handleSort('status')}
                    className="px-3 py-3 pr-5 cursor-pointer hover:bg-[#FAFAF7] group transition-colors bg-[#FAFAF7] whitespace-nowrap"
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
                  const ratePerParcel = r.rate_per_parcel ?? 50;

                  const grossPay = r.gross_pay ?? 0;
                  const otherEarnings = Number(r.other_earnings ?? 0);
                  const fmPickupPay = Number(r.fm_pickup_count ?? 0) * 3;
                  const totalDeductions = Number(r.deductions ?? 0) + Number(r.late_onhold ?? 0) + Number(r.late_remittance ?? 0);
                  const netPay = grossPay + otherEarnings + fmPickupPay - totalDeductions;

                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => onOpenDetails(r, payrollRecords)}
                        className={`border-b border-[#EFEAE2] cursor-pointer transition hover:bg-[#FFF1E0]/20`}
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
                              className="rounded border-[#EFEAE2] text-[#db6c00] focus:ring-[#db6c00] h-3.5 w-3.5 cursor-pointer accent-[#db6c00]"
                            />
                            <ChevronRight className="w-4 h-4 text-[#6B6258] hover:text-[#db6c00] transition-colors" />
                            {onComputeRider && (
                              <button
                                onClick={() => onComputeRider(r)}
                                className={`px-2 py-0.5 text-[10px] font-bold rounded transition cursor-pointer ${
                                  isEditableStatus(r.status)
                                    ? 'bg-[#db6c00]/10 hover:bg-[#db6c00] hover:text-white text-[#db6c00]'
                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                                }`}
                              >
                                {isEditableStatus(r.status) ? 'Compute' : 'View'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-[#FAFAF7] border border-[#EFEAE2] flex items-center justify-center shrink-0">
                              <Users className="w-4 h-4 text-[#db6c00]" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold text-[#1A1410] truncate">{riderName}</div>
                              {!isAdminOrHr && <div className="text-[10.5px] font-mono text-[#6B6258]">{riderId}</div>}
                            </div>
                          </div>
                        </td>
                        {isAdminOrHr && (
                          <td className="px-3 py-3 text-[#1A1410] font-mono text-xs whitespace-nowrap">{riderId}</td>
                        )}
                        <td className="px-3 py-3 text-[#1A1410]">{zone}</td>
                        {isAdminOrHr && (
                          <td className="px-3 py-3 text-[#6B6258] text-xs whitespace-nowrap">
                            {formatCutoff(r.cutoff_start, r.cutoff_end)}
                          </td>
                        )}
                        {!isAdminOrHr && (
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-[#1A1410] whitespace-nowrap">
                            {r.total_parcels}
                          </td>
                        )}
                        {!isAdminOrHr && (
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-[#6B6258] whitespace-nowrap">
                            ₱{ratePerParcel.toFixed(2)}
                          </td>
                        )}
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-[#6B6258] whitespace-nowrap">
                          {phpFmt(grossPay)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold text-[#db6c00] whitespace-nowrap">
                          {phpFmt(netPay)}
                        </td>
                        {isAdminOrHr && (
                          <td className="px-3 py-3 text-[#1A1410] text-xs truncate max-w-[120px] whitespace-nowrap">
                            {r.submitted_user?.full_name || '—'}
                          </td>
                        )}
                        {isAdminOrHr && (
                          <td className="px-3 py-3 text-[#6B6258] text-xs whitespace-nowrap">
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
          <div className="px-5 py-3.5 border-t border-[#EFEAE2] bg-[#FAFAF7]/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#6B6258]">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span>Show:</span>
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-7 px-2.5 rounded border border-[#EFEAE2] bg-white text-xs outline-none cursor-pointer focus:border-[#db6c00]"
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
                className="h-8 px-2.5 rounded-lg border border-[#EFEAE2] bg-white hover:bg-[#FAFAF7] text-[#1A1410] font-semibold flex items-center justify-center gap-1 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Prev
              </button>
              <span className="font-medium text-[#1A1410]">
                Page {page} of {Math.max(Math.ceil(totalCount / pageSize), 1)}
              </span>
              <button
                disabled={page >= Math.ceil(totalCount / pageSize)}
                onClick={() => setPage(p => Math.min(p + 1, Math.ceil(totalCount / pageSize)))}
                className="h-8 px-2.5 rounded-lg border border-[#EFEAE2] bg-white hover:bg-[#FAFAF7] text-[#1A1410] font-semibold flex items-center justify-center gap-1 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
