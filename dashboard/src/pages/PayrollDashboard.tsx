import { useMemo, useState, useEffect, Fragment } from 'react';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Lock,
  Calendar,
  Layers,
  Loader2
} from 'lucide-react';
import { StatCard } from '../components/common/StatCard';
import { getPayrollRecords } from '../services/parcelService';
import { PayrollDetailsModal } from '../components/payroll/PayrollDetailsModal';
import { AnimatePresence } from 'framer-motion';

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
    riders: {
      name: string;
      mkb_id: string;
      zones: { name: string } | null;
    } | null;
  }
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecordRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Derive Cutoff Period Date range
  const cutoffFrom = useMemo(() => {
    const startDay = half === 'first' ? 1 : 16;
    return `${currentYear}-${pad(month + 1)}-${pad(startDay)}`;
  }, [month, half, currentYear]);

  const cutoffTo = useMemo(() => {
    const endDay = half === 'first' ? 15 : new Date(currentYear, month + 1, 0).getDate();
    return `${currentYear}-${pad(month + 1)}-${pad(endDay)}`;
  }, [month, half, currentYear]);

  // Load records from Supabase
  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      try {
        const records: PayrollRecordRow[] = await getPayrollRecords(cutoffFrom, cutoffTo);
        setPayrollRecords(records);
      } catch (err) {
        console.error('Failed to load payroll records', err);
      } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, [cutoffFrom, cutoffTo, reloadTrigger]);

  // Details Modal States
  const [selectedRecordForDetails, setSelectedRecordForDetails] = useState<PayrollRecordRow | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Sync selected record with updated dashboard data (e.g. after approval/payment)
  useEffect(() => {
    if (selectedRecordForDetails) {
      const updated = payrollRecords.find(r => r.id === selectedRecordForDetails.id);
      if (updated) {
        setSelectedRecordForDetails(updated);
      }
    }
  }, [payrollRecords]);

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

  // Compute fleet totals
  const totals = useMemo(() => {
    const totalGross = payrollRecords.reduce((s, r) => s + (r.gross_pay ?? 0), 0);
    const totalParcels = payrollRecords.reduce((s, r) => s + (r.total_parcels || 0), 0);
    const flagged = payrollRecords.filter(r => r.status === 'flagged').length;
    const complete = payrollRecords.filter(r => r.status !== 'flagged').length;

    return {
      totalGross,
      totalParcels,
      flagged,
      complete
    };
  }, [payrollRecords]);

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
          value={payrollRecords.length}
          sub={`Active payroll · ${cutoffLabel}`}
          icon={Users}
          accent="amber"
          spark={[12, 14, 16, 18, 19, 20, payrollRecords.length]}
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
          label="Total Gross Payroll"
          value={phpFmt(totals.totalGross)}
          sub="Ready for payout"
          icon={CheckCircle2}
          accent="green"
          trend={{
            direction: 'up',
            value: `${payrollRecords.length} processed riders`
          }}
          spark={[60000, 70000, 85000, 95000, 105000, totals.totalGross]}
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

      {/* Main Table */}
      <div className="bg-white border border-[#EFEAE2] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EFEAE2] flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[#1A1410]">Rider Payroll List</div>
            <div className="text-[11px] text-[#6B6258] font-mono mt-0.5">
              {payrollRecords.length} records · {cutoffLabel} · Click rows to inspect daily breakdowns
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#FFF1E0] border border-[#db6c00]/30 text-[10px] uppercase tracking-wider font-semibold text-[#db6c00]">
            <Lock className="w-3 h-3" /> Read-only
          </span>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#FAFAF7] border-b border-[#EFEAE2]">
                <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-[#6B6258] font-semibold">
                  <th className="px-5 py-3 w-8"></th>
                  <th className="px-3 py-3">Rider</th>
                  <th className="px-3 py-3">Zone</th>
                  <th className="px-3 py-3 text-right">Parcels Delivered</th>
                  <th className="px-3 py-3 text-right">Rate per Parcel</th>
                  <th className="px-3 py-3 text-right">Gross Pay</th>
                  <th className="px-3 py-3 pr-5">Status</th>
                </tr>
              </thead>
              <tbody>
                {payrollRecords.map(r => {
                  const riderName = r.riders?.name || 'Unknown Rider';
                  const riderId = r.riders?.mkb_id || 'MKB-RIDER';
                  const zone = r.riders?.zones?.name || '—';
                  const ratePerParcel = r.rate_per_parcel ?? 50;

                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => {
                          setSelectedRecordForDetails(r);
                          setIsModalOpen(true);
                        }}
                        className={`border-b border-[#EFEAE2] cursor-pointer transition hover:bg-[#FFF1E0]/30`}
                      >
                        <td className="px-5 py-3 relative">
                          {r.status === 'flagged' && (
                            <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-red-500" />
                          )}
                          <ChevronRight className="w-4 h-4 text-[#6B6258]" />
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
                        <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold text-[#1A1410]">
                          {phpFmt(r.gross_pay ?? 0)}
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

        {/* Footer Summary Pinned Section */}
        {!loading && payrollRecords.length > 0 && (
          <div className="px-5 py-4 border-t border-[#EFEAE2] bg-[#FFF1E0]/30 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold">
                Total Gross Payroll
              </div>
              <div className="text-xl font-bold text-[#db6c00] font-mono tabular-nums">
                {phpFmt(totals.totalGross)}
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
                <span className="text-sm text-[#6B6258] font-normal">/ {payrollRecords.length}</span>
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
