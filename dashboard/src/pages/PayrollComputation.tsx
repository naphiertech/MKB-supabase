import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getRidersLookup } from '../services/riderService';
import { getRiderAttendanceInDateRange } from '../services/attendanceService';
import {
  getPayrollDeliveryData,
  savePayrollRecord,
  initializeCutoffPayrollForFleet,
  resetDraftPayrollForCutoff,
  type ParcelLog
} from '../services/parcelService';
import { SearchableRiderComboboxModal } from '../components/payroll/SearchableRiderComboboxModal';
import { useAuth } from '../hooks/useAuth';
import { exportParcelPayslipPDF, exportParcelCSV, parcelLogsToPayslipDays, type PayslipSnapshotContext } from '../lib/exports/payrollExport';
import { pushToast } from '../hooks/useToast';
import { isReadOnlyStatus } from '../types/payroll';
import {
  FileDown,
  FileSpreadsheet,
  Calculator,
  User as UserIcon,
  Lock,
  Sparkles,
  Loader2,
  Calendar,
  Zap,
  Search as SearchIcon,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';
import { RiderPayrollList, type PayrollRecordRow } from '../components/payroll/RiderPayrollList';
import { PayrollDetailsModal } from '../components/payroll/PayrollDetailsModal';
import { useParcelLogsRealtimeVersion } from '../hooks/useParcelLogsRealtimeVersion';

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

export function PayrollComputation() {
  const { user } = useAuth();

  interface RiderRow {
    id: string;
    name: string;
    mkb_id: string;
    zones: { name: string } | null;
  }
  const [riders, setRiders] = useState<RiderRow[]>([]);
  
  // Workspace states
  const [activeRider, setActiveRider] = useState<PayrollRecordRow | null>(null);
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Cutoff period selectors (shared)
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [half, setHalf] = useState<'first' | 'second'>(() =>
    new Date().getDate() <= 15 ? 'first' : 'second'
  );

  const cutoffFrom = useMemo(() => {
    const startDay = half === 'first' ? 1 : 16;
    return `${currentYear}-${pad(month + 1)}-${pad(startDay)}`;
  }, [month, half, currentYear]);

  const cutoffTo = useMemo(() => {
    const endDay = half === 'first' ? 15 : new Date(currentYear, month + 1, 0).getDate();
    return `${currentYear}-${pad(month + 1)}-${pad(endDay)}`;
  }, [month, half, currentYear]);

  const cutoffLabel = useMemo(() => {
    return half === 'first'
      ? `${MONTHS[month]} 1–15`
      : `${MONTHS[month]} 16–${new Date(currentYear, month + 1, 0).getDate()}`;
  }, [month, half, currentYear]);
  const parcelLogsVersion = useParcelLogsRealtimeVersion(selectedRiderId, cutoffFrom, cutoffTo);

  // Details Modal States
  const [selectedRecordForDetails, setSelectedRecordForDetails] = useState<PayrollRecordRow | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [recordsInPage, setRecordsInPage] = useState<PayrollRecordRow[]>([]);

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

  const [dayEntries, setDayEntries] = useState<Array<ParcelLog & { timeIn: string | null }>>([]);
  const [snapshotContext, setSnapshotContext] = useState<PayslipSnapshotContext>({
    source: 'live', calculationVersion: 2, standardParcels: 0, heavyParcels: 0,
    failedParcels: 0, returnedParcels: 0, standardEarnings: 0, heavyEarnings: 0, grossDeliveryPay: 0,
  });
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [initializingFleet, setInitializingFleet] = useState(false);
  const [resettingFleet, setResettingFleet] = useState(false);
  const [confirmInitOpen, setConfirmInitOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const handleInitializeFleet = async () => {
    setInitializingFleet(true);
    try {
      const res = await initializeCutoffPayrollForFleet(cutoffFrom, cutoffTo, user?.id);
      if (res.initializedCount > 0) {
        pushToast({
          title: "Fleet Cutoff Initialized",
          description: `Created draft payroll records for ${res.initializedCount} rider(s) (${res.totalRiders} total in fleet).`,
          tone: "success"
        });
      } else {
        pushToast({
          title: "Cutoff Already Initialized",
          description: `All ${res.totalRiders} fleet riders already have payroll records for this cutoff.`,
          tone: "info"
        });
      }
      setReloadTrigger(prev => prev + 1);
    } catch (err) {
      console.error("Failed to initialize fleet payroll:", err);
      pushToast({
        title: "Initialization Failed",
        description: "Failed to create draft payroll entries for fleet.",
        tone: "error"
      });
    } finally {
      setInitializingFleet(false);
      setConfirmInitOpen(false);
    }
  };

  const handleResetFleetDrafts = async () => {
    setResettingFleet(true);
    try {
      await resetDraftPayrollForCutoff(cutoffFrom);
      pushToast({
        title: "Draft Cutoff Reset",
        description: `Unedited draft payroll records for ${cutoffLabel} have been removed.`,
        tone: "info"
      });
      setReloadTrigger(prev => prev + 1);
    } catch (err) {
      console.error("Failed to reset draft payroll:", err);
      pushToast({
        title: "Reset Failed",
        description: "Failed to delete unedited draft payroll records.",
        tone: "error"
      });
    } finally {
      setResettingFleet(false);
      setConfirmResetOpen(false);
    }
  };

  // Load all riders from Supabase on mount
  useEffect(() => {
    const loadRiders = async () => {
      try {
        const data = await getRidersLookup();
        setRiders(data as unknown as RiderRow[]);
      } catch (error) {
        console.error('Error loading riders:', error);
        pushToast({
          title: 'Error loading riders',
          description: 'Failed to load riders list.',
          tone: 'error'
        });
      }
    };
    loadRiders();
  }, []);

  // Generate date range and load existing logs from database
  useEffect(() => {
    if (!selectedRiderId || !cutoffFrom || !cutoffTo) return;

    const loadLogs = async () => {
      setLoadingLogs(true);

      try {
        const targetRecord = activeRider && activeRider.rider_id === selectedRiderId
          ? activeRider
          : {
              id: `draft-${selectedRiderId}`,
              rider_id: selectedRiderId,
              cutoff_start: cutoffFrom,
              cutoff_end: cutoffTo,
              status: 'draft',
              calculation_version: 2,
            };
        const isWorkingRecord = targetRecord.status === 'draft' || targetRecord.status === 'rejected';
        const [deliveryData, attList] = await Promise.all([
          getPayrollDeliveryData(targetRecord),
          isWorkingRecord
            ? getRiderAttendanceInDateRange(selectedRiderId, cutoffFrom, cutoffTo)
            : Promise.resolve([])
        ]);
        const entries = deliveryData.lines.map(line => {
          const att = attList.find(a => a.date === line.date);
          return {
            ...line,
            timeIn: att?.rawTimeIn || (att?.timeIn ? `${line.date}T${att.timeIn}:00` : null),
          };
        });

        setDayEntries(entries);
        setSnapshotContext({
          source: deliveryData.source,
          calculationVersion: deliveryData.calculationVersion,
          standardParcels: deliveryData.summary.standardDelivered,
          heavyParcels: deliveryData.summary.heavyDelivered,
          failedParcels: deliveryData.summary.failed,
          returnedParcels: deliveryData.summary.returned,
          standardEarnings: deliveryData.summary.standardEarnings,
          heavyEarnings: deliveryData.summary.heavyEarnings,
          grossDeliveryPay: deliveryData.summary.grossDeliveryPay,
        });
      } catch (err) {
        console.error('Failed to load logs', err);
        pushToast({
          title: 'Error loading logs',
          description: 'Failed to fetch logs from Supabase.',
          tone: 'error'
        });
      } finally {
        setLoadingLogs(false);
      }
    };

    loadLogs();
  }, [selectedRiderId, cutoffFrom, cutoffTo, parcelLogsVersion, activeRider]);

  // Save finalized payroll record
  const handleFinalize = async () => {
    if (!selectedRiderId) return;
    setSavingAll(true);
    try {
      await savePayrollRecord(
        selectedRiderId,
        cutoffFrom,
        cutoffTo
      );
      pushToast({
        title: 'Payroll Finalized',
        description: `${selectedRider?.name} · ${totalParcels} parcels · ₱${grossPay.toLocaleString()}`,
        tone: 'success'
      });
      setReloadTrigger(prev => prev + 1);
    } catch (err) {
      console.error('Failed to finalize record', err);
      pushToast({
        title: 'Finalization failed',
        description: 'Failed to write record in Supabase.',
        tone: 'error'
      });
    } finally {
      setSavingAll(false);
    }
  };

  // Computations
  const totalParcels = dayEntries.reduce((sum, e) => sum + e.parcels + e.heavyParcels, 0);
  const grossPay = dayEntries.reduce((sum, e) => sum + e.dailyGross, 0);
  const selectedRider = riders.find(r => r.id === selectedRiderId);
  const zoneName = selectedRider?.zones?.name || '—';
  const payslipDays = parcelLogsToPayslipDays(dayEntries);

  const isReadOnly = activeRider ? isReadOnlyStatus(activeRider.status) : false;

  // Export handlers
  const handleExportPDF = () => {
    if (!selectedRider) return;
    try {
      exportParcelPayslipPDF(
        selectedRider.name,
        selectedRider.mkb_id || 'MKB-RIDER',
        zoneName,
        cutoffFrom,
        cutoffTo,
        payslipDays,
        snapshotContext
      );
      pushToast({
        title: 'PDF Payslip Generated',
        tone: 'success'
      });
    } catch (err) {
      pushToast({
        title: 'PDF generation failed',
        description: err instanceof Error ? err.message : 'The payroll snapshot could not be exported.',
        tone: 'error'
      });
    }
  };

  const handleExportCSV = () => {
    if (!selectedRider) return;
    try {
      exportParcelCSV(
        selectedRider.name,
        selectedRider.mkb_id || 'MKB-RIDER',
        cutoffFrom,
        cutoffTo,
        payslipDays,
        snapshotContext
      );
      pushToast({
        title: 'CSV exported successfully',
        tone: 'success'
      });
    } catch (err) {
      pushToast({
        title: 'CSV export failed',
        description: err instanceof Error ? err.message : 'The payroll snapshot could not be exported.',
        tone: 'error'
      });
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">

      {/* Shared Cutoff Selection Header */}
      <div className="bg-white border border-border rounded-xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-accent ring-1 ring-primary/30 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
                Cutoff Period
              </div>
              <div className="text-sm font-semibold text-foreground">
                {cutoffLabel}, {currentYear}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              disabled={!!activeRider}
              className="h-9 px-3 pr-8 rounded-md bg-panel-bg border border-border text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 font-mono cursor-pointer disabled:opacity-50"
            >
              {MONTHS.map((m, idx) => (
                <option key={m} value={idx}>
                  {m} {currentYear}
                </option>
              ))}
            </select>

            <div className="inline-flex rounded-md border border-border bg-panel-bg p-0.5">
              <button
                onClick={() => setHalf('first')}
                disabled={!!activeRider}
                className={`h-8 px-3 rounded text-xs font-semibold transition disabled:opacity-50 ${half === 'first' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {MONTHS[month].slice(0, 3)} 1–15
              </button>
              <button
                onClick={() => setHalf('second')}
                disabled={!!activeRider}
                className={`h-8 px-3 rounded text-xs font-semibold transition disabled:opacity-50 ${half === 'second' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {MONTHS[month].slice(0, 3)} 16–{new Date(currentYear, month + 1, 0).getDate()}
              </button>
            </div>

            {/* Fleet Initialization & Searchable Combobox Actions */}
            {!activeRider && (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmInitOpen(true)}
                  disabled={initializingFleet || resettingFleet}
                  className="h-9 px-3.5 rounded-lg bg-accent hover:bg-primary text-primary hover:text-white border border-primary/30 text-xs font-bold transition inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                  title="Create draft payroll rows for all active fleet riders for this cutoff"
                >
                  {initializingFleet ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Initializing...
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      Initialize Fleet Cutoff
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmResetOpen(true)}
                  disabled={initializingFleet || resettingFleet}
                  className="h-9 px-3 rounded-lg border border-red-200 bg-red-50/50 hover:bg-red-100 hover:text-red-700 text-red-600 text-xs font-semibold transition inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                  title="Remove unedited 0-parcel draft records for this cutoff"
                >
                  {resettingFleet ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  Reset Drafts
                </button>

                <button
                  type="button"
                  onClick={() => setComboboxOpen(true)}
                  className="h-9 px-3.5 rounded-lg bg-white border border-border hover:border-primary/40 hover:bg-panel-bg text-foreground text-xs font-semibold transition inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <SearchIcon className="w-3.5 h-3.5 text-primary" />
                  Search & Pick Rider...
                </button>
              </>
            )}

          </div>
        </div>
      </div>

      {!activeRider ? (
        /* View A: Rider Payroll List */
        <RiderPayrollList
          cutoffFrom={cutoffFrom}
          cutoffTo={cutoffTo}
          role="payroll"
          reloadTrigger={reloadTrigger}
          onStatusUpdated={() => setReloadTrigger(prev => prev + 1)}
          onComputeRider={(record) => {
            setSelectedRiderId(record.rider_id);
            setActiveRider(record);
          }}
          onOpenDetails={handleOpenDetails}
        />
      ) : (
        /* View B: Active Rider Workspace */
        <div className="space-y-5">
          {/* Active Rider Header Navigation */}
          <div className="flex items-center justify-between bg-white border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveRider(null)}
                className="h-9 px-3.5 rounded-lg border border-border hover:bg-panel-bg text-xs font-semibold transition inline-flex items-center gap-1.5 cursor-pointer text-foreground"
              >
                &larr; Back to Rider List
              </button>
              <div>
                <div className="text-sm font-bold text-foreground">
                  Computing for {activeRider.riders?.name}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  {activeRider.riders?.mkb_id} &bull; {activeRider.riders?.zones?.name || 'No Zone'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenDetails(activeRider, [activeRider])}
                className="h-9 px-3.5 rounded-lg border border-border hover:bg-panel-bg text-xs font-semibold text-foreground transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                Open Details Drawer
              </button>
            </div>
          </div>

          {/* Selector and Settings Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left Panel: Selected Rider summary */}
            <div className="bg-white border border-border rounded-xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/30 flex items-center justify-center">
                      <UserIcon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">Rider Profile</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{activeRider.riders?.mkb_id}</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-panel-bg border border-border">
                  <div className="w-9 h-9 rounded-full bg-accent border border-border flex items-center justify-center shrink-0">
                    <UserIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">
                      {activeRider.riders?.name}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                      {activeRider.riders?.zones?.name || 'No Zone'}
                    </div>
                  </div>
                </div>

                {/* Dynamic Rate Rules Notice */}
                <div className="mt-5 space-y-3.5">
                  <div className="bg-panel-bg border border-border rounded-lg p-3.5 space-y-2">
                    <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-bold">
                      Dynamic Rate Rules
                    </div>
                    <div className="text-xs space-y-1.5 text-foreground">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Early In (≤ 8:00 AM)</span>
                        <span className="font-semibold font-mono text-emerald-600">₱12.00 / pc</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Standard (8:01–9:00 AM)</span>
                        <span className="font-semibold font-mono text-amber-600">₱11.00 / pc</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Late / Fallback (≥ 9:01 AM)</span>
                        <span className="font-semibold font-mono text-red-600">₱10.00 / pc</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel: Computation & Summary */}
            <div className="lg:col-span-2 bg-white border border-border rounded-xl overflow-hidden flex flex-col justify-between">
              <div>
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/30 flex items-center justify-center">
                      <Calculator className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">Salary Computation</div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {cutoffFrom} → {cutoffTo} &bull; operational data is read-only
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold text-primary bg-accent border border-primary/30 uppercase tracking-wider">
                    <Lock className="w-3 h-3" /> Parcel Operations Source
                  </span>
                </div>

                {/* Summaries */}
                <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-lg p-3.5 border bg-panel-bg border-border">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
                      Parcels Delivered
                    </div>
                    <div className="mt-1.5 text-lg font-bold font-mono text-foreground">
                      {totalParcels}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      this cutoff period
                    </div>
                  </div>

                  <div className="rounded-lg p-3.5 border bg-panel-bg border-border">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
                      Rate Per Parcel
                    </div>
                    <div className="mt-1.5 text-lg font-bold font-mono text-primary">
                      Dynamic
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      ₱10.00 – ₱12.00 / pc
                    </div>
                  </div>

                  <div className="rounded-lg p-3.5 border bg-accent/60 border-primary/30">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
                      Gross Pay
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={grossPay}
                          initial={{ opacity: 0, scale: 0.95, y: 8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.25 }}
                          className="text-2xl font-bold text-primary font-mono"
                        >
                          ₱{grossPay.toLocaleString()}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                    <div className="text-[10px] text-primary font-mono mt-0.5">
                      calculated from clock-in logs
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-5 pb-5 space-y-3">
                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleExportPDF}
                    className="flex-1 h-11 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition inline-flex items-center justify-center gap-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
                  >
                    <FileDown className="w-4 h-4" />
                    Export PDF Payslip
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleExportCSV}
                    className="flex-1 h-11 rounded-lg bg-white border border-border hover:border-primary/40 hover:bg-accent/40 text-foreground text-sm font-semibold transition inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-primary" />
                    Export CSV
                  </motion.button>
                </div>

                {/* Finalize row */}
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={handleFinalize}
                  disabled={savingAll || dayEntries.length === 0 || isReadOnly}
                  className="w-full h-11 rounded-lg bg-foreground hover:bg-black text-white text-sm font-semibold transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isReadOnly ? (
                    <>
                      <Lock className="w-4 h-4 text-subtle-text" />
                      Submitted & Read-Only
                    </>
                  ) : savingAll ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Finalizing Cutoff...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      Finalize & Save Cutoff Record
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </div>

          {/* Read-only operational context from parcel_logs */}
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">Operational Breakdown</div>
                <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                  {dayEntries.length} days &bull; {selectedRider?.name || '—'} &bull; read-only from parcel_logs
                </div>
              </div>
            </div>

            {/* Loading skeleton */}
            {loadingLogs && (
              <div className="p-5 space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="h-10 bg-panel-bg rounded animate-pulse" />
                ))}
              </div>
            )}

            {!loadingLogs && dayEntries.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No dates found. Select a valid cutoff range above.
              </div>
            )}

            {!loadingLogs && dayEntries.length > 0 && (
              <div className="table-scroll-region" role="region" aria-label="Daily payroll computation" tabIndex={0}>
                <table className="data-table-extra-wide w-full text-sm">
                  <thead className="bg-panel-bg border-b border-border">
                    <tr className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground font-bold">
                      <th className="px-5 py-3.5">Date</th>
                      <th className="px-5 py-3.5">Clock In</th>
                      <th className="px-5 py-3.5 text-right">Standard</th>
                      <th className="px-5 py-3.5 text-right">Heavy</th>
                      <th className="px-5 py-3.5 text-right">Failed</th>
                      <th className="px-5 py-3.5 text-right">Returned</th>
                      <th className="px-5 py-3.5 text-right">Std Rate</th>
                      <th className="px-5 py-3.5 text-right">Heavy Rate</th>
                      <th className="px-5 py-3.5 text-right">Std Earnings</th>
                      <th className="px-5 py-3.5 text-right">Heavy Earnings</th>
                      <th className="px-5 py-3.5 text-right">Gross Wage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayEntries.map(e => {
                      const dt = new Date(e.date);
                      // Display values
                      const displayTimeIn = (() => {
                        if (!e.timeIn) return '—';
                        const d = new Date(e.timeIn);
                        if (!isNaN(d.getTime())) {
                          return d.toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          });
                        }
                        if (/^\d{1,2}:\d{2}$/.test(e.timeIn)) {
                          const [hStr, mStr] = e.timeIn.split(':');
                          let h = parseInt(hStr, 10);
                          const ampm = h >= 12 ? 'PM' : 'AM';
                          h = h % 12 || 12;
                          return `${h}:${mStr} ${ampm}`;
                        }
                        return e.timeIn;
                      })();

                      return (
                        <tr
                          key={e.date}
                          className="border-b border-border transition-colors hover:bg-panel-bg"
                        >
                          <td className="px-5 py-4 font-semibold text-foreground">
                            {dt.toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </td>
                          <td className="px-5 py-4 text-muted-foreground">{displayTimeIn}</td>
                          <td className="px-5 py-4 text-right font-mono font-semibold text-foreground">{e.parcels}</td>
                          <td className="px-5 py-4 text-right font-mono font-semibold text-violet-700">{e.heavyParcels}</td>
                          <td className="px-5 py-4 text-right font-mono text-red-700">{e.failedParcels}</td>
                          <td className="px-5 py-4 text-right font-mono text-amber-700">{e.returnedParcels}</td>
                          <td className="px-5 py-4 text-right font-mono text-muted-foreground">
                            ₱{e.rate.toFixed(2)}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-muted-foreground">₱{e.heavyRate.toFixed(2)}</td>
                          <td className="px-5 py-4 text-right font-mono text-foreground">₱{e.standardEarnings.toLocaleString()}</td>
                          <td className="px-5 py-4 text-right font-mono text-violet-700">₱{e.heavyEarnings.toLocaleString()}</td>
                          <td className="px-5 py-4 text-right font-mono font-semibold text-primary">
                            ₱{e.dailyGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Details Slide-over Drawer */}
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
            role="payroll"
            indexLabel={`${activeIndex + 1} of ${recordsInPage.length}`}
          />
        )}
      </AnimatePresence>

      <SearchableRiderComboboxModal
        isOpen={comboboxOpen}
        onClose={() => setComboboxOpen(false)}
        riders={riders}
        onSelectRider={(riderId) => {
          setSelectedRiderId(riderId);
          const rObj = riders.find(r => r.id === riderId);
          if (rObj) {
            setActiveRider({
              id: `draft-${riderId}`,
              rider_id: riderId,
              cutoff_start: cutoffFrom,
              cutoff_end: cutoffTo,
              total_parcels: 0,
              rate_per_parcel: null,
              standard_parcels: 0,
              heavy_parcels: 0,
              standard_earnings: 0,
              heavy_earnings: 0,
              calculation_version: 2,
              gross_pay: 0,
              status: 'draft',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              riders: {
                id: riderId,
                name: rObj.name,
                mkb_id: rObj.mkb_id,
                notes: null,
                zones: rObj.zones
              }
            });
          }
        }}
      />

      {/* Confirmation Modal: Fleet Initialization */}
      <AnimatePresence>
        {confirmInitOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmInitOpen(false)}
              className="absolute inset-0 bg-foreground/55 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="viewport-dialog relative z-10 w-full max-w-md space-y-4 rounded-xl border border-border bg-white p-4 text-left shadow-2xl sm:rounded-2xl sm:p-6"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent border border-primary/30 flex items-center justify-center shrink-0">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Initialize Fleet Cutoff?</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Period: {cutoffLabel}, {currentYear}</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Are you sure you want to generate draft payroll records for all <strong className="text-foreground">{riders.length} active fleet riders</strong> for this cutoff period?
              </p>
              <p className="text-[11px] text-subtle-text italic">
                Note: Existing submitted, approved, or edited records will remain completely safe.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmInitOpen(false)}
                  className="px-4 h-9 rounded-lg border border-border hover:bg-panel-bg text-xs font-semibold text-foreground transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleInitializeFleet}
                  disabled={initializingFleet}
                  className="px-5 h-9 rounded-lg bg-primary hover:bg-primary-hover text-xs font-bold text-white transition inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {initializingFleet ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Initializing...
                    </>
                  ) : (
                    'Yes, Initialize Fleet'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal: Reset Fleet Drafts */}
      <AnimatePresence>
        {confirmResetOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmResetOpen(false)}
              className="absolute inset-0 bg-foreground/55 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="viewport-dialog relative z-10 w-full max-w-md space-y-4 rounded-xl border border-border bg-white p-4 text-left shadow-2xl sm:rounded-2xl sm:p-6"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Reset Unedited Drafts?</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Period: {cutoffLabel}, {currentYear}</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                This will delete unedited draft payroll entries (<strong className="text-foreground">0 parcels logged</strong>) for this cutoff period.
              </p>
              <p className="text-[11px] text-emerald-600 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 font-medium">
                ✓ Any records with parcels entered or submitted for approval are protected and will NOT be deleted.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmResetOpen(false)}
                  className="px-4 h-9 rounded-lg border border-border hover:bg-panel-bg text-xs font-semibold text-foreground transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleResetFleetDrafts}
                  disabled={resettingFleet}
                  className="px-5 h-9 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-bold text-white transition inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {resettingFleet ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    'Yes, Delete Drafts'
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
