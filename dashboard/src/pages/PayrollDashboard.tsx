import { useMemo, useState, useEffect } from 'react';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Calendar,
  Layers,
  Loader2,
  Clock,
  ArrowRight,
  Calculator,
  XCircle,
  CheckCircle
} from 'lucide-react';
import { StatCard } from '../components/common/StatCard';
import { getPayrollRecords } from '../services/parcelService';
import { PayrollDetailsModal } from '../components/payroll/PayrollDetailsModal';
import { AnimatePresence } from 'framer-motion';
import { RiderPayrollList, type PayrollRecordRow } from '../components/payroll/RiderPayrollList';
import { getActivityLogs, type ActivityLog } from '../lib/apiService';

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
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [half, setHalf] = useState<'first' | 'second'>(() =>
    new Date().getDate() <= 15 ? 'first' : 'second'
  );

  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [allCutoffRecords, setAllCutoffRecords] = useState<PayrollRecordRow[]>([]);

  // Recent activity logs states
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  // Details Modal States (for Admin/HR Checklist review)
  const [selectedRecordForDetails, setSelectedRecordForDetails] = useState<PayrollRecordRow | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [recordsInPage, setRecordsInPage] = useState<PayrollRecordRow[]>([]);

  // Derive Cutoff Period Date range
  const cutoffFrom = useMemo(() => {
    const startDay = half === 'first' ? 1 : 16;
    return `${currentYear}-${pad(month + 1)}-${pad(startDay)}`;
  }, [month, half, currentYear]);

  const cutoffTo = useMemo(() => {
    const endDay = half === 'first' ? 15 : new Date(currentYear, month + 1, 0).getDate();
    return `${currentYear}-${pad(month + 1)}-${pad(endDay)}`;
  }, [month, half, currentYear]);

  // Fetch all records for cutoff (for cards & stats)
  useEffect(() => {
    const loadAllRecords = async () => {
      try {
        const records = await getPayrollRecords(cutoffFrom, cutoffTo);
        setAllCutoffRecords(records as unknown as PayrollRecordRow[]);
      } catch (err) {
        console.error('Failed to load all cutoff records:', err);
      }
    };
    loadAllRecords();
  }, [cutoffFrom, cutoffTo, reloadTrigger]);

  // Fetch recent payroll activities for Dashboard role
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

  // Compute fleet totals and approval-based statistics
  const totals = useMemo(() => {
    const totalGross = allCutoffRecords.reduce((s, r) => s + (r.gross_pay ?? 0), 0);
    const totalNet = allCutoffRecords.reduce((s, r) => {
      const other = Number(r.other_earnings ?? 0);
      const fm = Number(r.fm_pickup_count ?? 0) * 3;
      const deduct = Number(r.deductions ?? 0) + Number(r.late_onhold ?? 0) + Number(r.late_remittance ?? 0);
      return s + ((r.gross_pay ?? 0) + other + fm - deduct);
    }, 0);
    const totalParcels = allCutoffRecords.reduce((s, r) => s + (r.total_parcels || 0), 0);
    
    // Approval Center metrics
    const pending = allCutoffRecords.filter(r => r.status === 'pending').length;
    const approved = allCutoffRecords.filter(r => r.status === 'approved').length;
    const rejected = allCutoffRecords.filter(r => r.status === 'rejected').length;
    const paid = allCutoffRecords.filter(r => r.status === 'paid').length;
    const flagged = allCutoffRecords.filter(r => r.status === 'flagged').length;

    return {
      totalGross,
      totalNet,
      totalParcels,
      pending,
      approved,
      rejected,
      paid,
      flagged
    };
  }, [allCutoffRecords]);

  const cutoffLabel =
    half === 'first'
      ? `${MONTHS[month]} 1–15`
      : `${MONTHS[month]} 16–${new Date(currentYear, month + 1, 0).getDate()}`;

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

  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      
      {/* Banner */}
      <div className="flex items-start gap-2.5 px-4 py-2.5 rounded-lg bg-[#FFF1E0] border border-[#db6c00]/30">
        <Lock className="w-4 h-4 text-[#db6c00] mt-0.5 shrink-0" />
        <div className="text-[12.5px] text-[#db6c00] leading-relaxed">
          <span className="font-semibold">
            {role === 'payroll' 
              ? 'Payroll Dashboard.' 
              : 'Payroll Approval Workspace.'
            }
          </span>{' '}
          {role === 'payroll' 
            ? 'Monitor cutoff overview statistics, recent activities, and use Quick Actions to compute wages.'
            : 'Review submitted payroll records, approve or reject payroll, and release approved payouts.'
          }
        </div>
      </div>

      {/* Stats Cards */}
      {role === 'payroll' ? (
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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatCard
            label="Pending Approval"
            value={totals.pending}
            sub="Awaiting review"
            icon={Clock}
            accent="amber"
            spark={[0, 1, 2, totals.pending]}
          />
          
          <StatCard
            label="Approved Payrolls"
            value={totals.approved}
            sub="Ready for payout"
            icon={CheckCircle}
            accent="green"
            spark={[0, 2, 4, totals.approved]}
          />
          
          <StatCard
            label="Rejected Payrolls"
            value={totals.rejected}
            sub="Returned for revision"
            icon={XCircle}
            accent="red"
            spark={[0, 0, 1, totals.rejected]}
          />
          
          <StatCard
            label="Paid Payrolls"
            value={totals.paid}
            sub="Disbursed payouts"
            icon={CheckCircle2}
            accent="green"
            spark={[0, 5, 10, totals.paid]}
          />
          
          <StatCard
            label="Flagged Payrolls"
            value={totals.flagged}
            sub="Discrepancies"
            icon={AlertTriangle}
            accent="red"
            spark={[0, 1, 0, totals.flagged]}
          />
        </div>
      )}

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

      {/* 2-Column Dashboard Overview for Payroll Officers */}
      {role === 'payroll' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Recent Activity */}
          <div className="lg:col-span-2 bg-white border border-[#EFEAE2] rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-[#EFEAE2] pb-3">
              <h3 className="text-sm font-bold text-[#1A1410] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#db6c00]" />
                Recent Payroll Activity
              </h3>
              <button 
                onClick={() => setReloadTrigger(prev => prev + 1)}
                className="text-[11px] font-semibold text-[#db6c00] hover:text-[#b85a00] transition cursor-pointer"
              >
                Refresh
              </button>
            </div>

            {loadingActivities ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-[#db6c00]" />
                <span className="text-xs text-[#6B6258]">Loading activity trail...</span>
              </div>
            ) : activities.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#6B6258] italic">
                No recent payroll activity recorded.
              </div>
            ) : (
              <div className="relative border-l border-[#EFEAE2] ml-3 pl-5 space-y-5 py-1">
                {activities.map((act) => {
                  let IconComponent = Clock;
                  let iconBg = 'bg-[#FAFAF7] border-[#EFEAE2] text-[#6B6258]';

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
                    iconBg = 'bg-[#FFF1E0] border-[#db6c00]/20 text-[#db6c00]';
                  }

                  return (
                    <div key={act.id} className="relative group">
                      {/* Timeline dot/icon */}
                      <span className={`absolute -left-[31px] top-0 flex items-center justify-center w-5 h-5 rounded-full border ${iconBg} shadow-sm z-10 transition-colors`}>
                        <IconComponent className="w-2.5 h-2.5" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-[#1A1410] leading-snug">
                          {act.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-[#A39988]">
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

          {/* Quick Actions */}
          <div className="bg-white border border-[#EFEAE2] rounded-xl p-5 shadow-sm space-y-4 h-fit">
            <h3 className="text-sm font-bold text-[#1A1410] border-b border-[#EFEAE2] pb-3">
              Quick Actions
            </h3>
            <div className="space-y-3">
              {/* Action 1 */}
              <button
                onClick={() => onNavigate?.('computation')}
                className="w-full text-left p-3.5 rounded-xl border border-[#EFEAE2] hover:border-[#db6c00]/30 hover:bg-[#FAFAF7] transition group flex items-start gap-3 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-[#FFF1E0] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Calculator className="w-4 h-4 text-[#db6c00]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-[#1A1410] group-hover:text-[#db6c00] transition-colors flex items-center gap-1.5">
                    Continue Computation
                    <ArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-[#db6c00]" />
                  </div>
                  <p className="text-[10.5px] text-[#6B6258] mt-0.5 leading-relaxed">
                    Compute daily parcel counts, adjust allowances/deductions, and submit payroll.
                  </p>
                </div>
              </button>

              {/* Action 2 */}
              <button
                onClick={() => onNavigate?.('reports')}
                className="w-full text-left p-3.5 rounded-xl border border-[#EFEAE2] hover:border-[#db6c00]/30 hover:bg-[#FAFAF7] transition group flex items-start gap-3 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-[#EFEAE2]/40 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Layers className="w-4 h-4 text-[#6B6258]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-[#1A1410] group-hover:text-[#db6c00] transition-colors flex items-center gap-1.5">
                    View Payroll Reports
                    <ArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-[#db6c00]" />
                  </div>
                  <p className="text-[10.5px] text-[#6B6258] mt-0.5 leading-relaxed">
                    Access generated payslips, previous cutoff archives, and export payout documents.
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Admin/HR Role: Render the checklist table directly */
        <RiderPayrollList
          cutoffFrom={cutoffFrom}
          cutoffTo={cutoffTo}
          role={currentUserRole}
          reloadTrigger={reloadTrigger}
          onStatusUpdated={() => setReloadTrigger(prev => prev + 1)}
          onOpenDetails={handleOpenDetails}
        />
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
