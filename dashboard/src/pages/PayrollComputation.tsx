import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getRidersLookup } from '../services/riderService';
import { getRiderAttendanceInDateRange } from '../services/attendanceService';
import {
  getParcelLogs,
  upsertParcelLog,
  savePayrollRecord,
  initializeCutoffPayrollForFleet,
  resetDraftPayrollForCutoff
} from '../services/parcelService';
import { BulkParcelUploadModal } from '../components/payroll/BulkParcelUploadModal';
import { SearchableRiderComboboxModal } from '../components/payroll/SearchableRiderComboboxModal';
import { useAuth } from '../hooks/useAuth';
import { exportParcelPayslipPDF, exportParcelCSV } from '../lib/exports/payrollExport';
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
  X,
  Calendar,
  Zap,
  Search as SearchIcon,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';
import { RiderPayrollList, type PayrollRecordRow } from '../components/payroll/RiderPayrollList';
import { PayrollDetailsModal } from '../components/payroll/PayrollDetailsModal';

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

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

  const rate = 10;
  const [dayEntries, setDayEntries] = useState<{
    date: string;
    parcels: number;
    dailyGross: number;
    rate: number;
    timeIn: string | null;
    saving: boolean;
    saved: boolean;
    error: boolean;
  }[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [initializingFleet, setInitializingFleet] = useState(false);
  const [resettingFleet, setResettingFleet] = useState(false);
  const [confirmInitOpen, setConfirmInitOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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

  // Unsaved draft states to prevent automatic saves on keystroke
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editingVal, setEditingVal] = useState<number>(0);

  // Modal confirmation gates
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDate, setConfirmDate] = useState<string | null>(null);
  const [confirmVal, setConfirmVal] = useState<number>(0);

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

    setEditingDate(null);
    const loadLogs = async () => {
      setLoadingLogs(true);

      const dates: string[] = [];
      const start = new Date(cutoffFrom);
      const end = new Date(cutoffTo);
      const current = new Date(start);
      while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }

      try {
        const [existingLogs, attList] = await Promise.all([
          getParcelLogs(selectedRiderId, cutoffFrom, cutoffTo),
          getRiderAttendanceInDateRange(selectedRiderId, cutoffFrom, cutoffTo)
        ]);
        const entries = dates.map(date => {
          const existing = existingLogs.find(l => l.date === date);
          const att = attList.find(a => a.date === date);

          const canonicalTimeIn = att?.rawTimeIn || (att?.timeIn ? `${date}T${att.timeIn}:00` : null);
          let calculatedRate = 10;
          if (canonicalTimeIn) {
            const d = new Date(canonicalTimeIn);
            if (!isNaN(d.getTime())) {
              const hours = d.getHours();
              const mins = d.getMinutes();
              const totalMinutes = hours * 60 + mins;
              if (totalMinutes <= 480) calculatedRate = 12; // before or at 8:00 AM
              else if (totalMinutes <= 540) calculatedRate = 11; // 8:01 to 9:00 AM
            }
          } else if (existing && existing.rate) {
            calculatedRate = existing.rate;
          }

          return {
            date,
            parcels: existing?.parcels ?? 0,
            dailyGross: existing ? existing.parcels * calculatedRate : 0,
            rate: calculatedRate,
            timeIn: canonicalTimeIn,
            saving: false,
            saved: !!existing,
            error: false,
          };
        });

        setDayEntries(entries);
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
  }, [selectedRiderId, cutoffFrom, cutoffTo, refreshKey]);

  // Handle typing in input field (saves to local draft state instead of DB)
  const handleInputChange = useCallback((date: string, val: number) => {
    setEditingDate(date);
    setEditingVal(val);
  }, []);

  // Update a single day's parcels and auto-save in Supabase
  const updateDayParcels = useCallback(async (
    date: string,
    parcels: number
  ) => {
    if (date > isoToday()) return;

    const entry = dayEntries.find(e => e.date === date);
    const targetRate = entry ? entry.rate : 10;

    setDayEntries(prev =>
      prev.map(item =>
        item.date === date
          ? {
              ...item,
              parcels,
              dailyGross: parcels * targetRate,
              saving: true,
              saved: false,
              error: false,
            }
          : item
      )
    );

    try {
      await upsertParcelLog(
        selectedRiderId,
        date,
        parcels,
        targetRate,
        user?.id ?? ''
      );

      setDayEntries(prev =>
        prev.map(item =>
          item.date === date
            ? { ...item, saving: false, saved: true }
            : item
        )
      );
    } catch (err) {
      console.error('Auto-save failed', err);
      setDayEntries(prev =>
        prev.map(item =>
          item.date === date
            ? { ...item, saving: false, error: true }
            : item
        )
      );
    }
  }, [selectedRiderId, dayEntries, user?.id]);

  // Save finalized payroll record
  const handleFinalize = async () => {
    if (!selectedRiderId) return;
    setSavingAll(true);
    try {
      await savePayrollRecord(
        selectedRiderId,
        cutoffFrom,
        cutoffTo,
        totalParcels,
        10, // Base/fallback rate per parcel
        grossPay
      );
      pushToast({
        title: 'Payroll Finalized',
        description: `${selectedRider?.name} · {totalParcels} parcels · ₱${grossPay.toLocaleString()}`,
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
  const totalParcels = dayEntries.reduce((sum, e) => sum + e.parcels, 0);
  const grossPay = dayEntries.reduce((sum, e) => sum + e.dailyGross, 0);
  const selectedRider = riders.find(r => r.id === selectedRiderId);
  const zoneName = selectedRider?.zones?.name || '—';

  const isReadOnly = activeRider ? isReadOnlyStatus(activeRider.status) : false;

  const confirmEntry = dayEntries.find(e => e.date === confirmDate);
  const activeConfirmRate = confirmEntry ? confirmEntry.rate : 10;

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
        rate, // fallbackRate (default 10)
        dayEntries
      );
      pushToast({
        title: 'PDF Payslip Generated',
        tone: 'success'
      });
    } catch (err) {
      pushToast({
        title: 'PDF generation failed',
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
        rate,
        dayEntries
      );
      pushToast({
        title: 'CSV exported successfully',
        tone: 'success'
      });
    } catch (err) {
      pushToast({
        title: 'CSV export failed',
        tone: 'error'
      });
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">

      {/* Shared Cutoff Selection Header */}
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
              disabled={!!activeRider}
              className="h-9 px-3 pr-8 rounded-md bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] outline-none focus:border-[#db6c00] focus:ring-2 focus:ring-[#db6c00]/15 font-mono cursor-pointer disabled:opacity-50"
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
                disabled={!!activeRider}
                className={`h-8 px-3 rounded text-xs font-semibold transition disabled:opacity-50 ${half === 'first' ? 'bg-[#db6c00] text-white shadow-sm' : 'text-[#6B6258] hover:text-[#1A1410]'}`}
              >
                {MONTHS[month].slice(0, 3)} 1–15
              </button>
              <button
                onClick={() => setHalf('second')}
                disabled={!!activeRider}
                className={`h-8 px-3 rounded text-xs font-semibold transition disabled:opacity-50 ${half === 'second' ? 'bg-[#db6c00] text-white shadow-sm' : 'text-[#6B6258] hover:text-[#1A1410]'}`}
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
                  className="h-9 px-3.5 rounded-lg bg-[#FFF1E0] hover:bg-[#db6c00] text-[#db6c00] hover:text-white border border-[#db6c00]/30 text-xs font-bold transition inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
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
                  className="h-9 px-3.5 rounded-lg bg-white border border-[#EFEAE2] hover:border-[#db6c00]/40 hover:bg-[#FAFAF7] text-[#1A1410] text-xs font-semibold transition inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <SearchIcon className="w-3.5 h-3.5 text-[#db6c00]" />
                  Search & Pick Rider...
                </button>
              </>
            )}

            {/* Bulk Upload Button (only in list view) */}
            {!activeRider && (
              <button
                type="button"
                onClick={() => setBulkImportOpen(true)}
                className="h-9 px-3.5 rounded-lg bg-white border border-[#EFEAE2] hover:bg-[#FAFAF7] text-[#6B6258] text-xs font-semibold transition inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#db6c00]" />
                Import Excel
              </button>
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
          <div className="flex items-center justify-between bg-white border border-[#EFEAE2] rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveRider(null)}
                className="h-9 px-3.5 rounded-lg border border-[#EFEAE2] hover:bg-[#FAFAF7] text-xs font-semibold transition inline-flex items-center gap-1.5 cursor-pointer text-[#1A1410]"
              >
                &larr; Back to Rider List
              </button>
              <div>
                <div className="text-sm font-bold text-[#1A1410]">
                  Computing for {activeRider.riders?.name}
                </div>
                <div className="text-[11px] text-[#6B6258] font-mono">
                  {activeRider.riders?.mkb_id} &bull; {activeRider.riders?.zones?.name || 'No Zone'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenDetails(activeRider, [activeRider])}
                className="h-9 px-3.5 rounded-lg border border-[#EFEAE2] hover:bg-[#FAFAF7] text-xs font-semibold text-[#1A1410] transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                Open Details Drawer
              </button>
            </div>
          </div>

          {/* Selector and Settings Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left Panel: Selected Rider summary */}
            <div className="bg-white border border-[#EFEAE2] rounded-xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#FFF1E0] ring-1 ring-[#db6c00]/30 flex items-center justify-center">
                      <UserIcon className="w-4 h-4 text-[#db6c00]" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[#1A1410]">Rider Profile</div>
                      <div className="text-[11px] text-[#6B6258] font-mono">{activeRider.riders?.mkb_id}</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2]">
                  <div className="w-9 h-9 rounded-full bg-[#FFF1E0] border border-[#EFEAE2] flex items-center justify-center shrink-0">
                    <UserIcon className="w-5 h-5 text-[#db6c00]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#1A1410] truncate">
                      {activeRider.riders?.name}
                    </div>
                    <div className="text-[11px] font-mono text-[#6B6258] truncate">
                      {activeRider.riders?.zones?.name || 'No Zone'}
                    </div>
                  </div>
                </div>

                {/* Dynamic Rate Rules Notice */}
                <div className="mt-5 space-y-3.5">
                  <div className="bg-[#FAFAF7] border border-[#EFEAE2] rounded-lg p-3.5 space-y-2">
                    <div className="text-[10.5px] uppercase tracking-[0.14em] text-[#6B6258] font-bold">
                      Dynamic Rate Rules
                    </div>
                    <div className="text-xs space-y-1.5 text-[#1A1410]">
                      <div className="flex justify-between items-center">
                        <span className="text-[#6B6258]">Early In (≤ 8:00 AM)</span>
                        <span className="font-semibold font-mono text-emerald-600">₱12.00 / pc</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#6B6258]">Standard (8:01–9:00 AM)</span>
                        <span className="font-semibold font-mono text-amber-600">₱11.00 / pc</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#6B6258]">Late / Fallback (≥ 9:01 AM)</span>
                        <span className="font-semibold font-mono text-red-600">₱10.00 / pc</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel: Computation & Summary */}
            <div className="lg:col-span-2 bg-white border border-[#EFEAE2] rounded-xl overflow-hidden flex flex-col justify-between">
              <div>
                <div className="px-5 py-4 border-b border-[#EFEAE2] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#FFF1E0] ring-1 ring-[#db6c00]/30 flex items-center justify-center">
                      <Calculator className="w-4 h-4 text-[#db6c00]" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[#1A1410]">Salary Computation</div>
                      <div className="text-[11px] text-[#6B6258] font-mono">
                        {cutoffFrom} → {cutoffTo} &bull; auto-saving logs
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold text-[#db6c00] bg-[#FFF1E0] border border-[#db6c00]/30 uppercase tracking-wider">
                    <Lock className="w-3 h-3" /> Auto-Saving
                  </span>
                </div>

                {/* Summaries */}
                <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-lg p-3.5 border bg-[#FAFAF7] border-[#EFEAE2]">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold">
                      Parcels Delivered
                    </div>
                    <div className="mt-1.5 text-lg font-bold font-mono text-[#1A1410]">
                      {totalParcels}
                    </div>
                    <div className="text-[10px] text-[#6B6258] font-mono mt-0.5">
                      this cutoff period
                    </div>
                  </div>

                  <div className="rounded-lg p-3.5 border bg-[#FAFAF7] border-[#EFEAE2]">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold">
                      Rate Per Parcel
                    </div>
                    <div className="mt-1.5 text-lg font-bold font-mono text-[#db6c00]">
                      Dynamic
                    </div>
                    <div className="text-[10px] text-[#6B6258] font-mono mt-0.5">
                      ₱10.00 – ₱12.00 / pc
                    </div>
                  </div>

                  <div className="rounded-lg p-3.5 border bg-[#FFF1E0]/60 border-[#db6c00]/30">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold">
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
                          className="text-2xl font-bold text-[#db6c00] font-mono"
                        >
                          ₱{grossPay.toLocaleString()}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                    <div className="text-[10px] text-[#db6c00] font-mono mt-0.5">
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
                    className="flex-1 h-11 rounded-lg bg-[#db6c00] hover:bg-[#b85a00] text-white text-sm font-semibold transition inline-flex items-center justify-center gap-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#db6c00]/30 cursor-pointer"
                  >
                    <FileDown className="w-4 h-4" />
                    Export PDF Payslip
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleExportCSV}
                    className="flex-1 h-11 rounded-lg bg-white border border-[#EFEAE2] hover:border-[#db6c00]/40 hover:bg-[#FFF1E0]/40 text-[#1A1410] text-sm font-semibold transition inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-[#db6c00]" />
                    Export CSV
                  </motion.button>
                </div>

                {/* Finalize row */}
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={handleFinalize}
                  disabled={savingAll || dayEntries.length === 0 || isReadOnly}
                  className="w-full h-11 rounded-lg bg-[#1A1410] hover:bg-black text-white text-sm font-semibold transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isReadOnly ? (
                    <>
                      <Lock className="w-4 h-4 text-[#A39988]" />
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

          {/* Day-by-Day Parcel Breakdown */}
          <div className="bg-white border border-[#EFEAE2] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EFEAE2] flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-[#1A1410]">Day-by-Day Parcel Breakdown</div>
                <div className="text-[11px] text-[#6B6258] font-mono mt-0.5">
                  {dayEntries.length} days &bull; {selectedRider?.name || '—'}
                </div>
              </div>
            </div>

            {/* Loading skeleton */}
            {loadingLogs && (
              <div className="p-5 space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="h-10 bg-[#FAFAF7] rounded animate-pulse" />
                ))}
              </div>
            )}

            {!loadingLogs && dayEntries.length === 0 && (
              <div className="p-10 text-center text-sm text-[#6B6258]">
                No dates found. Select a valid cutoff range above.
              </div>
            )}

            {!loadingLogs && dayEntries.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#FAFAF7] border-b border-[#EFEAE2]">
                    <tr className="text-left text-[10.5px] uppercase tracking-wider text-[#6B6258] font-bold">
                      <th className="px-5 py-3.5">Date</th>
                      <th className="px-5 py-3.5">Clock In</th>
                      <th className="px-5 py-3.5 text-right">Parcels</th>
                      <th className="px-5 py-3.5 text-right">Rate</th>
                      <th className="px-5 py-3.5 text-right">Gross Wages</th>
                      <th className="px-5 py-3.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayEntries.map(e => {
                      const dt = new Date(e.date);
                      const isFuture = e.date > isoToday();
                      const isEditing = editingDate === e.date;

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
                          className={`border-b border-[#EFEAE2] transition-colors hover:bg-[#FAFAF7] ${
                            isFuture ? 'opacity-40 select-none' : ''
                          }`}
                        >
                          <td className="px-5 py-4 font-semibold text-[#1A1410]">
                            {dt.toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </td>
                          <td className="px-5 py-4 text-[#6B6258]">{displayTimeIn}</td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                type="number"
                                disabled={isFuture || e.saving || isReadOnly}
                                min={0}
                                value={isEditing ? editingVal : e.parcels || ''}
                                placeholder="0"
                                onChange={ev => {
                                  const v = Math.max(0, parseInt(ev.target.value) || 0);
                                  handleInputChange(e.date, v);
                                }}
                                onBlur={() => {
                                  if (isEditing) {
                                    if (editingVal !== e.parcels) {
                                      setConfirmDate(e.date);
                                      setConfirmVal(editingVal);
                                      setConfirmOpen(true);
                                    } else {
                                      setEditingDate(null);
                                    }
                                  }
                                }}
                                className="w-20 text-right px-2 py-1 rounded bg-[#FAFAF7] border border-[#EFEAE2] hover:border-[#db6c00]/30 outline-none focus:border-[#db6c00] focus:ring-1 focus:ring-[#db6c00]/15 font-mono text-xs disabled:opacity-50"
                              />
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-[#6B6258]">
                            ₱{e.rate.toFixed(2)}
                          </td>
                          <td className="px-5 py-4 text-right font-mono font-semibold text-[#db6c00]">
                            ₱{e.dailyGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-5 py-4 text-center">
                            {e.saving ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#db6c00]">
                                <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                              </span>
                            ) : e.saved ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-200">
                                Saved
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-semibold border border-amber-200">
                                Draft
                              </span>
                            )}
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

      {/* Override Confirmation Modal */}
      <AnimatePresence>
        {confirmOpen && (
          <div className="fixed inset-0 bg-[#1A1410]/20 backdrop-blur-xs flex items-center justify-center p-4 z-[2000]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-[#EFEAE2] rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#EFEAE2] pb-3">
                <h3 className="text-sm font-bold text-[#1A1410] flex items-center gap-1.5">
                  <Calculator className="w-4.5 h-4.5 text-[#db6c00]" />
                  Confirm Log Adjustment
                </h3>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="p-1 rounded-lg hover:bg-[#FAFAF7] text-[#A39988] hover:text-[#1A1410] transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-[#6B6258] leading-relaxed">
                You are manually overriding the parcel logs for{' '}
                <span className="font-semibold text-[#1A1410]">
                  {confirmDate ? new Date(confirmDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                </span>{' '}
                to <span className="font-bold text-[#db6c00]">{confirmVal} parcels</span>. This will immediately recalculate wages for this date.
              </div>

              <div className="bg-[#FAFAF7] border border-[#EFEAE2] rounded-lg p-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#6B6258] font-semibold">Active Rate</div>
                  <div className="text-sm font-bold text-[#1A1410] font-mono mt-0.5">₱{activeConfirmRate.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#6B6258] font-semibold">New Gross Pay</div>
                  <div className="text-lg font-bold text-[#db6c00] font-mono mt-0.5">₱{(confirmVal * activeConfirmRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="px-4 h-9 rounded-md bg-white border border-[#EFEAE2] hover:bg-[#FAFAF7] text-sm font-semibold text-[#6B6258] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (confirmDate) {
                      await updateDayParcels(confirmDate, confirmVal);
                      setEditingDate(null);
                    }
                    setConfirmOpen(false);
                  }}
                  className="px-4 h-9 rounded-md bg-[#db6c00] hover:bg-[#b85a00] text-sm font-semibold text-white transition shadow-sm cursor-pointer"
                >
                  Confirm & Save
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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

      <BulkParcelUploadModal
        isOpen={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        riders={riders}
        onUploadSuccess={() => {
          setRefreshKey(k => k + 1);
          setReloadTrigger(prev => prev + 1);
        }}
        currentUserId={user?.id}
      />

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
              rate_per_parcel: 10,
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
              className="absolute inset-0 bg-[#1A1410]/55 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white border border-[#EFEAE2] rounded-2xl p-6 shadow-2xl z-10 space-y-4 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FFF1E0] border border-[#db6c00]/30 flex items-center justify-center shrink-0">
                  <Zap className="w-5 h-5 text-[#db6c00]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#1A1410]">Initialize Fleet Cutoff?</h3>
                  <p className="text-[11px] text-[#6B6258] mt-0.5">Period: {cutoffLabel}, {currentYear}</p>
                </div>
              </div>

              <p className="text-xs text-[#6B6258] leading-relaxed">
                Are you sure you want to generate draft payroll records for all <strong className="text-[#1A1410]">{riders.length} active fleet riders</strong> for this cutoff period?
              </p>
              <p className="text-[11px] text-[#A39988] italic">
                Note: Existing submitted, approved, or edited records will remain completely safe.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmInitOpen(false)}
                  className="px-4 h-9 rounded-lg border border-[#EFEAE2] hover:bg-[#FAFAF7] text-xs font-semibold text-[#1A1410] transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleInitializeFleet}
                  disabled={initializingFleet}
                  className="px-5 h-9 rounded-lg bg-[#db6c00] hover:bg-[#b85a00] text-xs font-bold text-white transition inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
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
              className="absolute inset-0 bg-[#1A1410]/55 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white border border-[#EFEAE2] rounded-2xl p-6 shadow-2xl z-10 space-y-4 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#1A1410]">Reset Unedited Drafts?</h3>
                  <p className="text-[11px] text-[#6B6258] mt-0.5">Period: {cutoffLabel}, {currentYear}</p>
                </div>
              </div>

              <p className="text-xs text-[#6B6258] leading-relaxed">
                This will delete unedited draft payroll entries (<strong className="text-[#1A1410]">0 parcels logged</strong>) for this cutoff period.
              </p>
              <p className="text-[11px] text-emerald-600 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 font-medium">
                ✓ Any records with parcels entered or submitted for approval are protected and will NOT be deleted.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmResetOpen(false)}
                  className="px-4 h-9 rounded-lg border border-[#EFEAE2] hover:bg-[#FAFAF7] text-xs font-semibold text-[#1A1410] transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleResetFleetDrafts}
                  disabled={resettingFleet}
                  className="px-5 h-9 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-bold text-white transition inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
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
