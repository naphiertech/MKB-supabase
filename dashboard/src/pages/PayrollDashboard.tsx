import { useMemo, useState, useEffect, Fragment } from 'react';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Lock,
  Calendar,
  Layers,
  Loader2,
  Search,
  ArrowUpDown,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { StatCard } from '../components/common/StatCard';
import { getPayrollRecords, getPaginatedPayrollRecords } from '../services/parcelService';
import { getZones } from '../services/geofenceService';
import { PayrollDetailsModal } from '../components/payroll/PayrollDetailsModal';
import { AnimatePresence } from 'framer-motion';
import { pushToast } from '../hooks/useToast';
import type { Zone } from '../services/types';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function phpFmt(n: number) {
  return `₱${n.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<
    string,
    {
      bg: string;
      text: string;
      border: string;
      dot: string;
      label: string;
    }
  > = {
    pending: {
      bg: 'bg-[#FFF1E0]',
      text: 'text-[#db6c00]',
      border: 'border-[#db6c00]/30',
      dot: 'bg-[#db6c00]',
      label: 'Pending'
    },
    approved: {
      bg: 'bg-sky-50',
      text: 'text-sky-700',
      border: 'border-sky-500/30',
      dot: 'bg-sky-500',
      label: 'Approved'
    },
    paid: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-500/30',
      dot: 'bg-emerald-500',
      label: 'Paid'
    },
    flagged: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-500/30',
      dot: 'bg-red-500',
      label: 'Flagged'
    }
  };

  const s = map[status.toLowerCase()] || map['pending'];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${s.bg} ${s.text} ${s.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

interface PayrollDashboardProps {
  role?: 'admin' | 'hr' | 'payroll';
}

export function PayrollDashboard({ role = 'payroll' }: PayrollDashboardProps) {
  const currentUserRole = role;
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [half, setHalf] = useState<'first' | 'second'>(() =>
    new Date().getDate() <= 15 ? 'first' : 'second'
  );
  interface PayrollRecordRow {
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
    riders: {
      name: string;
      mkb_id: string;
      notes: string | null;
      zones: { name: string } | null;
    } | null;
  }
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecordRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);

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

  // Derive Cutoff Period Date range
  const cutoffFrom = useMemo(() => {
    const startDay = half === 'first' ? 1 : 16;
    return `${currentYear}-${pad(month + 1)}-${pad(startDay)}`;
  }, [month, half, currentYear]);

  const cutoffTo = useMemo(() => {
    const endDay = half === 'first' ? 15 : new Date(currentYear, month + 1, 0).getDate();
    return `${currentYear}-${pad(month + 1)}-${pad(endDay)}`;
  }, [month, half, currentYear]);

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

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, zoneFilter, half, month]);

  // Load paginated records from Supabase
  useEffect(() => {
    const loadDashboard = async () => {
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
        pushToast({
          title: 'Error loading payroll',
          description: 'Failed to load cutoff records from Supabase.',
          tone: 'error'
        });
      } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, [cutoffFrom, cutoffTo, page, pageSize, debouncedSearch, statusFilter, zoneFilter, sortBy, sortOrder, reloadTrigger]);

  // Details Modal States
  const [selectedRecordForDetails, setSelectedRecordForDetails] = useState<PayrollRecordRow | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Sync selected record with updated dashboard data (e.g. after approval/payment)
  useEffect(() => {
    if (selectedRecordForDetails) {
      const updated = payrollRecords.find(r => r.id === selectedRecordForDetails.id);
      if (updated && updated !== selectedRecordForDetails) {
        setSelectedRecordForDetails(updated);
      }
    }
  }, [payrollRecords, selectedRecordForDetails]);

  const activeIndex = useMemo(() => {
    if (!selectedRecordForDetails) return -1;
    return payrollRecords.findIndex(r => r.id === selectedRecordForDetails.id);
  }, [selectedRecordForDetails, payrollRecords]);

  const handlePrev = () => {
    if (activeIndex > 0) {
      setSelectedRecordForDetails(payrollRecords[activeIndex - 1]);
    }
  };

  const handleNext = () => {
    if (activeIndex < payrollRecords.length - 1) {
      setSelectedRecordForDetails(payrollRecords[activeIndex + 1]);
    }
  };

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

  const [allCutoffRecords, setAllCutoffRecords] = useState<PayrollRecordRow[]>([]);

  // Fetch all records for the cutoff period to compute fleet totals (for cards)
  useEffect(() => {
    const loadAllRecords = async () => {
      try {
        const records = await getPayrollRecords(cutoffFrom, cutoffTo);
        setAllCutoffRecords(records);
      } catch (err) {
        console.error('Failed to load all cutoff records:', err);
      }
    };
    loadAllRecords();
  }, [cutoffFrom, cutoffTo, reloadTrigger]);

  // Compute fleet totals based on all records in cutoff
  const totals = useMemo(() => {
    const totalGross = allCutoffRecords.reduce((s, r) => s + (r.gross_pay ?? 0), 0);
    const totalNet = allCutoffRecords.reduce((s, r) => {
      const other = Number(r.other_earnings ?? 0);
      const fm = Number(r.fm_pickup_count ?? 0) * 3;
      const deduct = Number(r.deductions ?? 0) + Number(r.late_onhold ?? 0) + Number(r.late_remittance ?? 0);
      return s + ((r.gross_pay ?? 0) + other + fm - deduct);
    }, 0);
    const totalParcels = allCutoffRecords.reduce((s, r) => s + (r.total_parcels || 0), 0);
    const flagged = allCutoffRecords.filter(r => r.status === 'flagged').length;
    const complete = allCutoffRecords.filter(r => r.status === 'paid').length;

    return {
      totalGross,
      totalNet,
      totalParcels,
      flagged,
      complete
    };
  }, [allCutoffRecords]);

  const cutoffLabel =
    half === 'first'
      ? `${MONTHS[month]} 1–15`
      : `${MONTHS[month]} 16–${new Date(currentYear, month + 1, 0).getDate()}`;

  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      
      {/* Banner */}
      <div className="flex items-start gap-2.5 px-4 py-2.5 rounded-lg bg-[#FFF1E0] border border-[#db6c00]/30">
        <Lock className="w-4 h-4 text-[#db6c00] mt-0.5 shrink-0" />
        <div className="text-[12.5px] text-[#db6c00] leading-relaxed">
          <span className="font-semibold">Read-only dashboard.</span> Payroll officers can view finalized
          cutoff records and total gross wages. Day-by-day parcel logs are logged manually inside the 
          Computation screen.
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Riders This Cutoff"
          value={allCutoffRecords.length}
          sub={`Active payroll · ${cutoffLabel}`}
          icon={Users}
          accent="amber"
          spark={[12, 14, 16, 18, 19, 20, allCutoffRecords.length]}
        />
        
        <StatCard
          label="Total Parcels Delivered"
          value={
            <>
              <span className="text-[#1A1410]">{totals.totalParcels.toLocaleString()}</span>
              <span className="text-[#A39988] text-xl"> pcs</span>
            </>
          }
          sub="Fleet total logs"
          icon={Layers}
          accent="amber"
          spark={[1400, 1600, 1900, 2100, 2300, 2500, totals.totalParcels]}
        />
        
        <StatCard
          label="Total Net Payroll"
          value={phpFmt(totals.totalNet)}
          sub={`Gross Total: ${phpFmt(totals.totalGross)}`}
          icon={CheckCircle2}
          accent="green"
          trend={{
            direction: 'up',
            value: `${allCutoffRecords.length} processed riders`
          }}
          spark={[60000, 70000, 85000, 95000, 105000, totals.totalNet]}
        />
        
        <StatCard
          label="Flagged Riders"
          value={totals.flagged}
          sub={totals.flagged > 0 ? 'Needs review' : 'All clear'}
          icon={AlertTriangle}
          accent="red"
          trend={{
            direction: totals.flagged > 0 ? 'up' : 'flat',
            value: 'awaiting validation',
            positive: false
          }}
          spark={[0, 1, 0, 2, totals.flagged]}
        />
      </div>

      {/* Date Pickers */}
      <div className="bg-white border border-[#EFEAE2] rounded-xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#FFF1E0] ring-1 ring-[#db6c00]/30 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-[#db6c00]" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold">
                Cutoff Period
              </div>
              <div className="text-sm font-semibold text-[#1A1410]">
                {cutoffLabel}, {currentYear}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="h-9 px-3 pr-8 rounded-md bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] outline-none focus:border-[#db6c00] focus:ring-2 focus:ring-[#db6c00]/15 font-mono cursor-pointer"
            >
              {MONTHS.map((m, idx) => (
                <option key={m} value={idx}>
                  {m} {currentYear}
                </option>
              ))}
            </select>

            <div className="inline-flex rounded-md border border-[#EFEAE2] bg-[#FAFAF7] p-0.5">
              <button
                onClick={() => setHalf('first')}
                className={`h-8 px-3 rounded text-xs font-semibold transition ${half === 'first' ? 'bg-[#db6c00] text-white shadow-sm' : 'text-[#6B6258] hover:text-[#1A1410]'}`}
              >
                {MONTHS[month].slice(0, 3)} 1–15
              </button>
              <button
                onClick={() => setHalf('second')}
                className={`h-8 px-3 rounded text-xs font-semibold transition ${half === 'second' ? 'bg-[#db6c00] text-white shadow-sm' : 'text-[#6B6258] hover:text-[#1A1410]'}`}
              >
                {MONTHS[month].slice(0, 3)} 16–{new Date(currentYear, month + 1, 0).getDate()}
              </button>
            </div>
          </div>
        </div>
      </div>

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
            <button 
              onClick={() => setSelectedRecordIds(new Set())}
              className="h-8 px-2.5 text-[#6B6258] hover:text-[#1A1410] text-xs font-semibold transition"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Main Table */}
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
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
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
                  <th className="px-5 py-3 w-16 bg-[#FAFAF7]">
                    <div className="flex items-center gap-2">
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
                  <th className="px-3 py-3 bg-[#FAFAF7]">Zone</th>
                  <th 
                    onClick={() => handleSort('total_parcels')}
                    className="px-3 py-3 text-right cursor-pointer hover:bg-[#FAFAF7] group transition-colors bg-[#FAFAF7]"
                  >
                    <div className="flex items-center justify-end">
                      Parcels {renderSortIcon('total_parcels')}
                    </div>
                  </th>
                  <th className="px-3 py-3 text-right bg-[#FAFAF7]">Rate</th>
                  <th 
                    onClick={() => handleSort('gross_pay')}
                    className="px-3 py-3 text-right cursor-pointer hover:bg-[#FAFAF7] group transition-colors bg-[#FAFAF7]"
                  >
                    <div className="flex items-center justify-end">
                      Gross Pay {renderSortIcon('gross_pay')}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('net_pay')}
                    className="px-3 py-3 text-right cursor-pointer hover:bg-[#FAFAF7] group transition-colors bg-[#FAFAF7]"
                  >
                    <div className="flex items-center justify-end">
                      Net Pay {renderSortIcon('net_pay')}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('status')}
                    className="px-3 py-3 pr-5 cursor-pointer hover:bg-[#FAFAF7] group transition-colors bg-[#FAFAF7]"
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
                        onClick={() => {
                          setSelectedRecordForDetails(r);
                          setIsModalOpen(true);
                        }}
                        className={`border-b border-[#EFEAE2] cursor-pointer transition hover:bg-[#FFF1E0]/20`}
                      >
                        <td className="px-5 py-3 relative" onClick={e => e.stopPropagation()}>
                          {r.status === 'flagged' && (
                            <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-red-500" />
                          )}
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedRecordIds.has(r.id)}
                              onChange={() => handleToggleSelectRow(r.id)}
                              className="rounded border-[#EFEAE2] text-[#db6c00] focus:ring-[#db6c00] h-3.5 w-3.5 cursor-pointer accent-[#db6c00]"
                            />
                            <ChevronRight className="w-4 h-4 text-[#6B6258] hover:text-[#db6c00] transition-colors" />
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-[#FAFAF7] border border-[#EFEAE2] flex items-center justify-center shrink-0">
                              <Users className="w-4 h-4 text-[#db6c00]" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold text-[#1A1410] truncate">{riderName}</div>
                              <div className="text-[10.5px] font-mono text-[#6B6258]">{riderId}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-[#1A1410]">{zone}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-[#1A1410]">
                          {r.total_parcels}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-[#6B6258]">
                          ₱{ratePerParcel.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-[#6B6258]">
                          {phpFmt(grossPay)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold text-[#db6c00]">
                          {phpFmt(netPay)}
                        </td>
                        <td className="px-3 py-3 pr-5">
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

        {/* Footer Summary Pinned Section */}
        {!loading && payrollRecords.length > 0 && (
          <div className="px-5 py-4 border-t border-[#EFEAE2] bg-[#FFF1E0]/30 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold">
                Total Net Payroll
              </div>
              <div className="text-xl font-bold text-[#db6c00] font-mono tabular-nums">
                {phpFmt(totals.totalNet)}
              </div>
              <div className="text-[10.5px] text-[#6B6258] mt-0.5 font-mono">
                Gross Total: {phpFmt(totals.totalGross)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold">
                Total Parcels
              </div>
              <div className="text-xl font-bold text-[#1A1410] font-mono tabular-nums">
                {totals.totalParcels.toLocaleString()}{' '}
                <span className="text-sm text-[#6B6258] font-normal">pcs</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold">
                Riders Paid
              </div>
              <div className="text-xl font-bold text-[#1A1410] font-mono tabular-nums">
                {totals.complete}{' '}
                <span className="text-sm text-[#6B6258] font-normal">/ {allCutoffRecords.length}</span>
              </div>
            </div>
          </div>
        )}
      </div>

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
            hasNext={activeIndex < payrollRecords.length - 1}
            role={currentUserRole as 'admin' | 'hr' | 'payroll' | 'rider'}
            indexLabel={`${activeIndex + 1} of ${payrollRecords.length}`}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
