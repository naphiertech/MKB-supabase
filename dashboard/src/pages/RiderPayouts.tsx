import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Wallet,
  Receipt,
  TrendingDown,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  BadgeAlert,
  ShieldCheck,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import { getRiderPayrollHistory, type RiderPayrollRecord } from '../services/riders/riderService';
import { listPayrollDeductionBalances, type PayrollDeductionBalance } from '../services/payroll/payrollAdjustmentRecordsService';
import { resolvePayrollWorksheet, type ItemizedDeductionLine } from '../lib/payroll/payrollAdjustments';
import { PayrollDetailsModal } from '../components/payroll/PayrollDetailsModal';
import { RiderPayoutsSkeleton } from '../components/rider/RiderRouteSkeletons';
import { appToast } from '../hooks/useToast';

interface RiderPayoutsProps {
  userId: string;
  riderId?: string;
  restricted?: boolean;
}

export function RiderPayouts({ userId, riderId, restricted: _restricted }: RiderPayoutsProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [records, setRecords] = useState<RiderPayrollRecord[]>([]);
  const [deductionBalances, setDeductionBalances] = useState<PayrollDeductionBalance[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<RiderPayrollRecord | null>(null);
  const [isPayslipOpen, setIsPayslipOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'payouts' | 'deductions'>('payouts');

  const activeRiderId = riderId || userId;

  const loadData = useCallback(async (isSilent = false) => {
    if (!activeRiderId) return;
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const [history, balances] = await Promise.all([
        getRiderPayrollHistory(activeRiderId),
        listPayrollDeductionBalances(activeRiderId).catch(() => []),
      ]);

      // Only show approved and paid records to riders
      const finalized = history.filter((rec: RiderPayrollRecord) =>
        rec.status === 'paid' || rec.status === 'approved'
      );

      setRecords(finalized);
      setDeductionBalances(balances);
      if (finalized.length > 0 && !selectedRecord) {
        setSelectedRecord(finalized[0]);
      }
    } catch (err) {
      console.error('[RiderPayouts] Failed to load payout records:', err);
      appToast.error('Failed to load payout history. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeRiderId, selectedRecord]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Financial aggregates across finalized records
  const stats = useMemo(() => {
    let totalNet = 0;
    let totalGross = 0;
    let totalDeductions = 0;
    let approvedCount = 0;
    let paidCount = 0;

    records.forEach((rec) => {
      const worksheet = resolvePayrollWorksheet(rec);
      totalNet += Number(worksheet.netPay) || 0;
      totalGross += Number(worksheet.grossPay) || 0;
      totalDeductions += Number(worksheet.totalDeductions) || 0;

      if (rec.status === 'paid') paidCount++;
      if (rec.status === 'approved') approvedCount++;
    });

    const activeBalanceSum = deductionBalances
      .filter((b) => b.status === 'active' || b.status === 'in_progress')
      .reduce((sum, b) => sum + (Number(b.outstanding) || 0), 0);

    return {
      totalNet,
      totalGross,
      totalDeductions,
      paidCount,
      approvedCount,
      activeBalanceSum,
    };
  }, [records, deductionBalances]);

  const selectedWorksheet = useMemo(
    () => (selectedRecord ? resolvePayrollWorksheet(selectedRecord) : null),
    [selectedRecord]
  );
  const selectedDeductions: ItemizedDeductionLine[] = selectedWorksheet?.deductionsList ?? [];
  const selectedNetPay = selectedWorksheet?.netPay ?? 0;
  const selectedTotalDeductions = selectedWorksheet?.totalDeductions ?? 0;

  if (loading) {
    return <RiderPayoutsSkeleton />;
  }

  return (
    <div className="p-4 md:p-6 lg:p-7 max-w-5xl mx-auto space-y-6">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-foreground tracking-tight">My Payouts</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  Approved Records Only
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Official cutoff earnings, itemized deduction statements, and printable payslip vouchers.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="h-9 px-3 text-xs font-medium rounded-lg border border-border bg-white text-muted-foreground hover:bg-panel-bg hover:text-foreground flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            title="Refresh Payouts"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* 2. Aggregate Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="ui-card p-4 space-y-1">
          <div className="text-[11px] font-mono font-medium text-muted-foreground flex items-center justify-between">
            <span>Total Net Paid</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            ₱{stats.totalNet.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {stats.paidCount} finalized pay {stats.paidCount === 1 ? 'cycle' : 'cycles'}
          </div>
        </div>

        <div className="ui-card p-4 space-y-1">
          <div className="text-[11px] font-mono font-medium text-muted-foreground flex items-center justify-between">
            <span>Total Deductions</span>
            <TrendingDown className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-700">
            ₱{stats.totalDeductions.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            Attendance, penalties & obligations
          </div>
        </div>

        <div className="ui-card p-4 space-y-1">
          <div className="text-[11px] font-mono font-medium text-muted-foreground flex items-center justify-between">
            <span>Approved / Ready</span>
            <Clock className="w-3.5 h-3.5 text-sky-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-sky-700">
            {stats.approvedCount}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {stats.approvedCount > 0 ? 'Scheduled for payment disbursement' : 'No pending payouts'}
          </div>
        </div>

        <div className="ui-card p-4 space-y-1">
          <div className="text-[11px] font-mono font-medium text-muted-foreground flex items-center justify-between">
            <span>Outstanding Deductions</span>
            <BadgeAlert className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-700">
            ₱{stats.activeBalanceSum.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {deductionBalances.length} active repayment plans
          </div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex border-b border-border gap-2">
        <button
          onClick={() => setActiveTab('payouts')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'payouts'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          Payslips & Payout History
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-panel-bg font-mono">
            {records.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('deductions')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'deductions'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5" />
          Outstanding Deductions & Plans
          {deductionBalances.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-50 text-rose-700 font-mono font-bold">
              {deductionBalances.length}
            </span>
          )}
        </button>
      </div>

      {/* 4. Tab Body */}
      {activeTab === 'payouts' ? (
        records.length === 0 ? (
          <div className="ui-card p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-accent text-primary mx-auto flex items-center justify-center">
              <Receipt className="w-6 h-6" />
            </div>
            <div className="text-sm font-semibold text-foreground">No Approved Payslips Available</div>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Your payroll records will appear here once approved by HR or Finance. Check back after the weekly cutoff period closes.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Cutoffs List */}
            <div className="lg:col-span-5 space-y-2">
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-bold font-mono px-1">
                Select Cutoff Period
              </div>
              <div className="space-y-2">
                {records.map((rec) => {
                  const isSelected = selectedRecord?.id === rec.id;
                  const net = resolvePayrollWorksheet(rec).netPay;

                  return (
                    <div
                      key={rec.id}
                      onClick={() => setSelectedRecord(rec)}
                      className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col gap-2 ${
                        isSelected
                          ? 'border-primary/40 bg-accent/40 shadow-xs'
                          : 'border-border bg-white hover:bg-panel-bg'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>
                            {new Date(rec.cutoff_start).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – {new Date(rec.cutoff_end).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider ${
                          rec.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-sky-50 text-sky-700 border border-sky-200'
                        }`}>
                          {rec.status === 'paid' ? 'Paid' : 'Approved'}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between border-t border-border/50 pt-2 text-xs">
                        <span className="text-muted-foreground font-mono text-[11px]">
                          {rec.total_parcels} parcels
                        </span>
                        <span className="font-bold font-mono text-foreground text-sm">
                          ₱{Number(net).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Paystub Detail & Itemized Deductions */}
            <div className="lg:col-span-7">
              {selectedRecord && (
                <div className="ui-card p-5 space-y-5">
                  <div className="flex items-start justify-between border-b border-border pb-4">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-bold">
                        Official Payslip Breakdown
                      </div>
                      <h2 className="text-base font-bold text-foreground mt-0.5">
                        {new Date(selectedRecord.cutoff_start).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – {new Date(selectedRecord.cutoff_end).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </h2>
                      <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                        Cutoff ID: <span className="font-semibold text-foreground">{selectedRecord.id.slice(0, 8)}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => setIsPayslipOpen(true)}
                      className="h-8 px-3 text-xs font-semibold rounded-lg bg-primary hover:bg-primary-hover text-white flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      View Payslip
                    </button>
                  </div>

                  {/* Wage Calculation Summary */}
                  <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-panel-bg border border-border">
                    <div>
                      <div className="text-[10.5px] text-muted-foreground font-mono">Gross Delivery Pay</div>
                      <div className="text-base font-bold font-mono text-foreground">
                        ₱{Number(selectedRecord.gross_pay ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {selectedRecord.total_parcels} pcs @ ₱{selectedRecord.rate_per_parcel ?? 18}/pc
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10.5px] text-muted-foreground font-mono">Net Payout Amount</div>
                      <div className="text-xl font-bold font-mono text-primary">
                        ₱{Number(selectedNetPay).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <span className={`inline-block mt-0.5 px-2 py-0.2 rounded text-[9.5px] font-bold uppercase tracking-wider ${
                        selectedRecord.status === 'paid' ? 'text-emerald-700 bg-emerald-50' : 'text-sky-700 bg-sky-50'
                      }`}>
                        {selectedRecord.status === 'paid' ? 'Paid Disbursement' : 'Ready for Disbursement'}
                      </span>
                    </div>
                  </div>

                  {/* Deduction Transparency Line Items */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <TrendingDown className="w-3.5 h-3.5 text-amber-600" />
                        <span>Itemized Deduction Breakdown</span>
                      </div>
                      <span className="text-xs font-bold font-mono text-amber-700">
                        Total: -₱{selectedTotalDeductions.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {selectedDeductions.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-border bg-emerald-50/40 text-center text-xs text-emerald-800 space-y-1">
                        <ShieldCheck className="w-5 h-5 mx-auto text-emerald-600" />
                        <div className="font-semibold">Zero Deductions Applied</div>
                        <p className="text-[11px] text-emerald-700">
                          No penalties, attendance lates, or equipment installments were deducted for this cutoff.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-white">
                        {selectedDeductions.map((item, index) => (
                          <div key={index} className="p-3 flex items-center justify-between text-xs hover:bg-panel-bg/40 transition">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${
                                item.category === 'attendance' ? 'bg-amber-500' :
                                item.category === 'penalty' ? 'bg-rose-500' : 'bg-primary'
                              }`} />
                              <div>
                                <div className="font-semibold text-foreground">{item.label}</div>
                                <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                                  {item.category}
                                </div>
                              </div>
                            </div>
                            <div className="font-mono font-bold text-rose-600">
                              -₱{item.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Notice Footer */}
                  <div className="p-3 rounded-lg bg-panel-bg text-[11px] text-muted-foreground flex items-start gap-2 border border-border/70">
                    <HelpCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <span>
                      Deduction questions or discrepancies? Contact your Hub Supervisor or HR Administrator with Cutoff ID <strong className="text-foreground">{selectedRecord.id.slice(0, 8)}</strong>.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      ) : (
        /* Deduction Balances Tab */
        <div className="space-y-4">
          <div className="ui-card p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-bold text-foreground">Outstanding Deduction Plans</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ongoing installments, equipment plans, and cash advance obligations being amortized across payroll periods.
              </p>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-mono text-muted-foreground">Total Remaining Balance</div>
              <div className="text-lg font-bold font-mono text-rose-700">
                ₱{stats.activeBalanceSum.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {deductionBalances.length === 0 ? (
            <div className="ui-card p-12 text-center space-y-2">
              <ShieldCheck className="w-10 h-10 text-emerald-600 mx-auto" />
              <div className="text-sm font-semibold text-foreground">No Active Deduction Obligations</div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                You do not have any pending uniform installments, cash advance obligations, or penalty balances on file.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {deductionBalances.map((bal, idx) => {
                const original = Number(bal.original_amount) || 0;
                const recovered = Number(bal.recovered) || 0;
                const outstanding = Number(bal.outstanding) || 0;
                const progressPct = original > 0 ? Math.min(100, Math.round((recovered / original) * 100)) : 100;

                return (
                  <div key={bal.obligation_id || idx} className="ui-card p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs font-bold text-foreground">
                          {bal.display_name || bal.adjustment_code || 'Deduction Plan'}
                        </div>
                        {bal.reference && (
                          <div className="text-[10px] font-mono text-muted-foreground">
                            Ref: {bal.reference}
                          </div>
                        )}
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider ${
                        outstanding === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {outstanding === 0 ? 'Fully Paid' : 'Active Plan'}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-muted-foreground">Recovered: ₱{recovered.toLocaleString()}</span>
                        <span className="font-semibold text-foreground">Total: ₱{original.toLocaleString()}</span>
                      </div>
                      <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-full transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10.5px] font-mono">
                        <span className="text-muted-foreground">{progressPct}% paid</span>
                        <span className="font-bold text-rose-600">Remaining: ₱{outstanding.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 5. Detailed Payslip Modal */}
      {isPayslipOpen && selectedRecord && (
        <PayrollDetailsModal
          isOpen={isPayslipOpen}
          onClose={() => setIsPayslipOpen(false)}
          record={selectedRecord as any}
          role="rider"
        />
      )}
    </div>
  );
}
