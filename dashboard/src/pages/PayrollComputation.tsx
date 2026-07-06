import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import {
  getParcelLogs,
  upsertParcelLog,
  savePayrollRecord,
} from '../services/parcelService';
import { exportParcelPayslipPDF, exportParcelCSV } from '../lib/exports/payrollExport';
import { pushToast } from '../hooks/useToast';
import {
  FileDown,
  FileSpreadsheet,
  Calculator,
  User as UserIcon,
  Check,
  ChevronsUpDown,
  Lock,
  Sparkles,
  Loader2,
  X
} from 'lucide-react';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
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
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [cutoffFrom, setCutoffFrom] = useState(isoOffset(14));
  const [cutoffTo, setCutoffTo] = useState(isoToday());
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
  const [pickerOpen, setPickerOpen] = useState(false);

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
      const { data } = await supabase
        .from('riders')
        .select('id, name, mkb_id, zones(name)')
        .order('name');
      if (data) {
        setRiders(data as unknown as RiderRow[]);
        if (data.length > 0) setSelectedRiderId(data[0].id);
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
        const [existingLogs, attendanceRes] = await Promise.all([
          getParcelLogs(selectedRiderId, cutoffFrom, cutoffTo),
          supabase
            .from('attendance_logs')
            .select('date, time_in')
            .eq('rider_id', selectedRiderId)
            .gte('date', cutoffFrom)
            .lte('date', cutoffTo)
        ]);

        const attList = attendanceRes.data || [];
        const entries = dates.map(date => {
          const existing = existingLogs.find(l => l.date === date);
          const att = attList.find(a => a.date === date);

          const rawTimeIn = att?.time_in || null;
          let calculatedRate = 10;
          if (rawTimeIn) {
            const d = new Date(rawTimeIn.replace(' ', 'T'));
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
            timeIn: rawTimeIn,
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
  }, [selectedRiderId, cutoffFrom, cutoffTo]);

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
        description: `${selectedRider?.name} · ${totalParcels} parcels · ₱${grossPay.toLocaleString()}`,
        tone: 'success'
      });
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
      {/* Selector and Settings Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Left Panel: Rider selector + Settings */}
        <div className="bg-white border border-[#EFEAE2] rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#FFF1E0] ring-1 ring-[#db6c00]/30 flex items-center justify-center">
                <UserIcon className="w-4 h-4 text-[#db6c00]" />
              </div>
              <div>
                <div className="text-sm font-semibold text-[#1A1410]">Select Rider</div>
                <div className="text-[11px] text-[#6B6258] font-mono">{riders.length} total</div>
              </div>
            </div>

            {/* Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setPickerOpen(v => !v)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] hover:border-[#db6c00]/40 transition text-left"
              >
                <div className="w-9 h-9 rounded-full bg-[#FFF1E0] border border-[#EFEAE2] flex items-center justify-center shrink-0">
                  <UserIcon className="w-5 h-5 text-[#db6c00]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[#1A1410] truncate">
                    {selectedRider?.name || 'Choose a rider...'}
                  </div>
                  <div className="text-[11px] font-mono text-[#6B6258] truncate">
                    {selectedRider?.mkb_id || 'MKB-000'} · {zoneName}
                  </div>
                </div>
                <ChevronsUpDown className="w-4 h-4 text-[#6B6258] shrink-0" />
              </button>

              <AnimatePresence>
                {pickerOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -5, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -5, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute z-[1020] mt-1.5 w-full max-h-72 overflow-y-auto bg-white border border-[#EFEAE2] rounded-lg shadow-lg"
                  >
                    {riders.map(r => {
                      const selected = r.id === selectedRiderId;
                      const rZone = r.zones?.name || '—';
                      return (
                        <button
                          key={r.id}
                          onClick={() => {
                            setSelectedRiderId(r.id);
                            setPickerOpen(false);
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#FFF1E0]/60 transition ${selected ? 'bg-[#FFF1E0]/80' : ''}`}
                        >
                          <div className="w-7 h-7 rounded-full bg-white border border-[#EFEAE2] flex items-center justify-center shrink-0">
                            <UserIcon className="w-4 h-4 text-[#db6c00]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-semibold text-[#1A1410] truncate">{r.name}</div>
                            <div className="text-[10.5px] font-mono text-[#6B6258] truncate">
                              {r.mkb_id} · {rZone}
                            </div>
                          </div>
                          {selected && <Check className="w-4 h-4 text-[#db6c00]" />}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
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

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
                    Cutoff From
                  </div>
                  <input
                    type="date"
                    value={cutoffFrom}
                    onChange={e => setCutoffFrom(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] font-mono outline-none focus:border-[#db6c00] focus:ring-2 focus:ring-[#db6c00]/15"
                  />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
                    Cutoff To
                  </div>
                  <input
                    type="date"
                    value={cutoffTo}
                    onChange={e => setCutoffTo(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] font-mono outline-none focus:border-[#db6c00] focus:ring-2 focus:ring-[#db6c00]/15"
                  />
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
                    {cutoffFrom} → {cutoffTo} · live database upsert
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
                className="flex-1 h-11 rounded-lg bg-[#db6c00] hover:bg-[#b85a00] text-white text-sm font-semibold transition inline-flex items-center justify-center gap-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#db6c00]/30"
              >
                <FileDown className="w-4 h-4" />
                Export PDF Payslip
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleExportCSV}
                className="flex-1 h-11 rounded-lg bg-white border border-[#EFEAE2] hover:border-[#db6c00]/40 hover:bg-[#FFF1E0]/40 text-[#1A1410] text-sm font-semibold transition inline-flex items-center justify-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4 text-[#db6c00]" />
                Export CSV
              </motion.button>
            </div>

            {/* Finalization row */}
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={handleFinalize}
              disabled={savingAll || dayEntries.length === 0}
              className="w-full h-11 rounded-lg bg-[#1A1410] hover:bg-black text-white text-sm font-semibold transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingAll ? (
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
              {dayEntries.length} days · {selectedRider?.name || '—'}
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
                <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-[#6B6258] font-semibold">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Parcels Delivered</th>
                  <th className="px-5 py-3">Rate</th>
                  <th className="px-5 py-3">Daily Gross</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {dayEntries.map(entry => {
                  const isHigh = entry.parcels > 100;
                  const isLow = entry.parcels > 0 && entry.parcels < 5;
                  const isFuture = entry.date > isoToday();
                  const isEditingThis = editingDate === entry.date;
                  const displayVal = isEditingThis ? editingVal : entry.parcels;

                  return (
                    <tr
                      key={entry.date}
                      className={`border-b border-[#EFEAE2] transition-colors
                        ${isFuture
                          ? 'opacity-40 bg-[#FAFAF7]/30'
                          : isEditingThis
                          ? 'bg-[#FFF1E0]/20'
                          : entry.parcels === 0
                          ? 'opacity-50'
                          : isHigh
                          ? 'bg-amber-50'
                          : isLow
                          ? 'bg-yellow-50'
                          : 'hover:bg-[#FAFAF7]/50'
                        }`}
                      title={
                        isFuture
                          ? 'Future date is locked'
                          : isHigh
                          ? 'Unusually high — please verify with supervisor'
                          : isLow
                          ? 'Very low count — please verify'
                          : undefined
                      }
                    >
                      <td className="px-5 py-2.5 text-sm text-[#1A1410]">
                        {new Date(entry.date).toLocaleDateString('en-PH', {
                          month: 'long',
                          day: '2-digit',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            value={displayVal}
                            disabled={isFuture}
                            onChange={e => handleInputChange(entry.date, Math.max(0, Number(e.target.value) || 0))}
                            className={`w-24 text-center border rounded-lg px-2.5 py-1 text-sm font-mono outline-none transition
                              ${isEditingThis 
                                ? 'border-[#db6c00] bg-white text-[#1A1410] ring-2 ring-[#db6c00]/15' 
                                : 'border-[#EFEAE2] bg-[#FAFAF7] text-[#1A1410] focus:border-[#db6c00]'
                              }
                              disabled:opacity-50 disabled:cursor-not-allowed`}
                          />
                          {isEditingThis && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmDate(entry.date);
                                  setConfirmVal(editingVal);
                                  setConfirmOpen(true);
                                }}
                                className="w-7 h-7 rounded bg-emerald-50 hover:bg-emerald-100 border border-emerald-500/30 flex items-center justify-center text-emerald-600 transition"
                                title="Save changes"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDate(null);
                                }}
                                className="w-7 h-7 rounded bg-red-50 hover:bg-red-100 border border-red-500/30 flex items-center justify-center text-red-500 transition"
                                title="Cancel edit"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-sm font-mono text-[#1A1410]">
                        {entry.parcels === 0 ? '—' : `₱${entry.rate.toFixed(2)}`}
                      </td>
                      <td className="px-5 py-2.5 text-sm font-mono text-[#1A1410]">
                        {entry.parcels === 0 ? '—' : `₱${entry.dailyGross.toLocaleString()}`}
                      </td>
                      <td className="px-5 py-2.5 text-xs">
                        {isFuture ? (
                          <span className="text-[#6B6258]/60 font-medium inline-flex items-center gap-1">
                            <Lock className="w-3.5 h-3.5" /> Locked
                          </span>
                        ) : isEditingThis ? (
                          <span className="text-amber-600 font-medium inline-flex items-center gap-1">
                            Unsaved draft
                          </span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              {entry.saving && <span className="text-amber-600 font-medium">Saving...</span>}
                              {entry.saved && !entry.saving && <span className="text-emerald-600 font-medium">✓ Saved</span>}
                              {entry.error && <span className="text-red-500 font-medium">Failed — retry</span>}
                            </div>
                            {entry.timeIn && (
                              <span className="text-[10px] text-[#6B6258] font-mono" title={`Dynamic rate calculated from clock-in time: ${entry.timeIn}`}>
                                Time-In: {new Date(entry.timeIn.replace(' ', 'T')).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#FFF1E0]/50 font-semibold border-t-2 border-[#EFEAE2]">
                  <td className="px-5 py-3.5 text-sm text-[#1A1410]">TOTAL</td>
                  <td className="px-5 py-3.5 text-sm font-mono text-[#db6c00]">{totalParcels} parcels</td>
                  <td className="px-5 py-3.5 text-sm font-mono text-[#6B6258]">—</td>
                  <td className="px-5 py-3.5 text-sm font-mono font-bold text-[#1A1410]">
                    ₱{grossPay.toLocaleString()}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmOpen && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            
            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-white border border-[#EFEAE2] rounded-xl p-5 shadow-xl z-10"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#FFF1E0] ring-1 ring-[#db6c00]/30 flex items-center justify-center shrink-0">
                  <Calculator className="w-5 h-5 text-[#db6c00]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#1A1410]">Verify Parcel Count Change</h3>
                  <p className="text-xs text-[#6B6258] mt-1 leading-relaxed">
                    You are updating the delivered parcels for <span className="font-semibold text-[#1A1410]">{confirmDate && new Date(confirmDate).toLocaleDateString('en-PH', { month: 'long', day: '2-digit', year: 'numeric' })}</span>.
                  </p>
                </div>
              </div>

              <div className="my-5 p-4 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#6B6258] font-semibold">New Count</div>
                  <div className="text-lg font-bold text-[#1A1410] font-mono mt-0.5">{confirmVal} parcels</div>
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
                  className="px-4 h-9 rounded-md bg-white border border-[#EFEAE2] hover:bg-[#FAFAF7] text-sm font-semibold text-[#6B6258] transition"
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
                  className="px-4 h-9 rounded-md bg-[#db6c00] hover:bg-[#b85a00] text-sm font-semibold text-white transition shadow-sm"
                >
                  Confirm & Save
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
