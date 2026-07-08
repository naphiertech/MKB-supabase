import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Download,
  Loader2,
  User as UserIcon,
  MapPin,
  Building,
  FileSpreadsheet,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import {
  getRiderPayrollMetrics,
  getParcelLogs,
  updatePayrollRecordStatus,
  type PayrollMetrics,
  type ParcelLog,
} from "../../services/parcelService";
import { getCachedAvatar, setCachedAvatar, fetchRiderAvatar } from "../../lib/avatarCache";

import {
  exportParcelPayslipPDF,
  exportParcelCSV,
  exportParcelPayslipXLSX,
} from "../../lib/exports/payrollExport";
import { pushToast } from "../../hooks/useToast";
import { PayrollMetricsGrid } from "./PayrollMetricsGrid";
import { SelectedDayDetails } from "./SelectedDayDetails";
import { AttendanceLogsTable } from "./AttendanceLogsTable";
import { PayslipSlipCard } from "./PayslipSlipCard";

export interface PayrollRecordShape {
  id: string;
  rider_id: string;
  cutoff_start: string;
  cutoff_end: string;
  total_parcels: number;
  rate_per_parcel: number | null;
  gross_pay: number | null;
  status: string;
  other_earnings?: number;
  fm_pickup_count?: number;
  deductions?: number;
  late_onhold?: number;
  late_remittance?: number;
  riders: {
    id?: string;
    name: string;
    mkb_id: string;
    face_image_url?: string | null;
    avatar_url?: string | null;
    zones?: { name: string } | null;
    shift?: string | null;
    notes?: string | null;
  } | null;
}

interface PayrollDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: PayrollRecordShape | null;
  onStatusUpdated?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  role: "admin" | "hr" | "payroll" | "rider";
  indexLabel?: string; // e.g. "3 of 12"
}


export function PayrollDetailsModal({
  isOpen,
  onClose,
  record,
  onStatusUpdated,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  role,
  indexLabel,
}: PayrollDetailsModalProps) {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<PayrollMetrics | null>(null);
  const [dayEntries, setDayEntries] = useState<ParcelLog[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [riderAvatar, setRiderAvatar] = useState<string | null>(null);

  // Option B: Dynamic adjustments states
  const [otherEarnings, setOtherEarnings] = useState(0);
  const [fmPickupCount, setFmPickupCount] = useState(0);
  const [deductions, setDeductions] = useState(0);
  const [lateOnhold, setLateOnhold] = useState(0);
  const [lateRemittance, setLateRemittance] = useState(0);
  const [isSavingAdjustments, setIsSavingAdjustments] = useState(false);

  // Load metrics & logs when record changes
  useEffect(() => {
    if (!record || !isOpen) return;

    let active = true;
    setRiderAvatar(null);
    const loadDetails = async () => {
      setLoading(true);
      try {
        const riderId = record.riders?.id || record.rider_id;
        let avatarVal = getCachedAvatar(riderId);
        if (!avatarVal && riderId) {
          avatarVal = await fetchRiderAvatar(riderId);
          if (avatarVal) {
            setCachedAvatar(riderId, avatarVal);
          }
        }
        if (active) {
          setRiderAvatar(avatarVal || record.riders?.avatar_url || null);
        }

        const [fetchedMetrics, fetchedLogs] = await Promise.all([
          getRiderPayrollMetrics(
            record.rider_id,
            record.cutoff_start,
            record.cutoff_end,
          ),
          getParcelLogs(
            record.rider_id,
            record.cutoff_start,
            record.cutoff_end,
          ),
        ]);

        if (active) {
          const dates: string[] = [];
          const start = new Date(record.cutoff_start);
          const end = new Date(record.cutoff_end);
          const current = new Date(start);
          while (current <= end) {
            dates.push(current.toISOString().split("T")[0]);
            current.setDate(current.getDate() + 1);
          }

          const mappedLogs = dates.map((date) => {
            const existing = fetchedLogs.find((l) => l.date === date);
            const attObj = fetchedMetrics.attendanceLogs.find(
              (a) => a.date === date
            );
            const rawTimeIn = attObj?.time_in || null;
            let calculatedRate = existing?.rate || 10;
            if (rawTimeIn) {
              const d = new Date(rawTimeIn.replace(" ", "T"));
              if (!isNaN(d.getTime())) {
                const hours = d.getHours();
                const mins = d.getMinutes();
                const totalMinutes = hours * 60 + mins;
                if (totalMinutes <= 480) calculatedRate = 12;
                else if (totalMinutes <= 540) calculatedRate = 11;
                else calculatedRate = 10;
              }
            }
            const parcels = existing?.parcels ?? 0;
            return {
              id: existing?.id || "",
              riderId: record.rider_id,
              date,
              parcels,
              rate: calculatedRate,
              dailyGross: parcels * calculatedRate,
            };
          });

          setMetrics(fetchedMetrics);
          setDayEntries(mappedLogs);

          // Option B: Initialize adjustments state from record
          setOtherEarnings(Number(record.other_earnings ?? 0));
          setFmPickupCount(Number(record.fm_pickup_count ?? 0));
          setDeductions(Number(record.deductions ?? 0));
          setLateOnhold(Number(record.late_onhold ?? 0));
          setLateRemittance(Number(record.late_remittance ?? 0));

          // Default selected day to the latest day with parcel deliveries, or just the first day in logs
          const withDeliveries = mappedLogs.filter((l) => l.parcels > 0);
          if (withDeliveries.length > 0) {
            setSelectedDate(withDeliveries[withDeliveries.length - 1].date);
          } else if (mappedLogs.length > 0) {
            setSelectedDate(mappedLogs[mappedLogs.length - 1].date);
          } else {
            setSelectedDate(null);
          }
        }
      } catch (err) {
        console.error("[PayrollDetailsModal] Failed to load details:", err);
        pushToast({
          title: "Error loading payroll details",
          description: "Failed to fetch attendance metrics or parcel logs.",
          tone: "error",
        });
      } finally {
        if (active) setLoading(false);
      }
    };

    loadDetails();
    return () => {
      active = false;
    };
  }, [record, isOpen]);

  // Group parcels by rate
  const rateBreakdown = useMemo(() => {
    if (!isOpen || !record) return [];
    const groups: Record<number, { parcels: number; gross: number }> = {};
    dayEntries.forEach((e) => {
      if (e.parcels > 0) {
        const r = e.rate || (record.rate_per_parcel ?? 10);
        if (!groups[r]) {
          groups[r] = { parcels: 0, gross: 0 };
        }
        groups[r].parcels += e.parcels;
        groups[r].gross += e.dailyGross;
      }
    });
    return Object.entries(groups).map(([rateKey, val]) => ({
      rate: Number(rateKey),
      parcels: val.parcels,
      gross: val.gross,
    })).sort((a, b) => b.rate - a.rate);
  }, [dayEntries, record, isOpen]);

  if (!isOpen || !record) return null;

  const riderName = record.riders?.name || "Unknown Rider";
  const riderMkbId = record.riders?.mkb_id || "MKB-RIDER";
  const zoneName = record.riders?.zones?.name || "Zamboanga City";
  const shiftText = record.riders?.shift || "Morning";
  const ratePerParcel = record.rate_per_parcel ?? 10;
  const computedGrossPay = dayEntries.reduce((sum, e) => sum + e.dailyGross, 0);
  const grossPay = record.gross_pay ?? computedGrossPay;

  // Status mapping
  const statusColors: Record<
    string,
    { bg: string; text: string; dot: string; label: string }
  > = {
    pending: {
      bg: "bg-amber-50 border-amber-500/20",
      text: "text-amber-700",
      dot: "bg-amber-500",
      label: "Unpaid",
    },
    approved: {
      bg: "bg-sky-50 border-sky-500/20",
      text: "text-sky-700",
      dot: "bg-sky-500",
      label: "Approved",
    },
    paid: {
      bg: "bg-emerald-50 border-emerald-500/20",
      text: "text-emerald-700",
      dot: "bg-emerald-500",
      label: "Paid",
    },
    flagged: {
      bg: "bg-red-50 border-red-500/20",
      text: "text-red-700",
      dot: "bg-red-500",
      label: "Flagged",
    },
  };
  const statusInfo =
    statusColors[record.status.toLowerCase()] || statusColors.pending;

  // Selected Day Details calculations
  const selectedDayLog = dayEntries.find((d) => d.date === selectedDate);
  const selectedDayAtt = metrics?.attendanceLogs.find(
    (a) => a.date === selectedDate,
  );

  // Geofence boundary exits/idle events on selected date
  const selectedDayViolations =
    metrics?.violations.filter((v) => {
      try {
        const vDate = new Date(v.created_at).toISOString().split("T")[0];
        return (
          vDate === selectedDate &&
          (v.type === "boundary_exit" || v.type === "idle_excess")
        );
      } catch {
        return false;
      }
    }) || [];

  // Metrics
  const presentCount = metrics?.presentDays ?? 0;
  const lateCount = metrics?.lateDays ?? 0;
  const violationCount = metrics?.violationsCount ?? 0;
  const avgDailyParcels =
    presentCount > 0 ? record.total_parcels / presentCount : 0;

  const handleSaveAdjustments = async () => {
    setIsSavingAdjustments(true);
    try {
      const { error } = await supabase
        .from("payroll_records")
        .update({
          other_earnings: otherEarnings,
          fm_pickup_count: fmPickupCount,
          deductions,
          late_onhold: lateOnhold,
          late_remittance: lateRemittance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", record.id);

      if (error) throw error;

      // Log this action to activity_logs
      await supabase.from("activity_logs").insert({
        user_id: (await supabase.auth.getUser()).data.user?.id || null,
        event_type: "payroll_adjustments_update",
        description: `Updated payroll adjustments for ${riderName} (${record.cutoff_start} to ${record.cutoff_end})`,
        metadata: {
          record_id: record.id,
          adjustments: {
            other_earnings: otherEarnings,
            fm_pickup_count: fmPickupCount,
            deductions,
            late_onhold: lateOnhold,
            late_remittance: lateRemittance,
          },
        },
      });

      pushToast({
        title: "Adjustments Saved",
        description: `Successfully updated adjustments for ${riderName}.`,
        tone: "success",
      });
      if (onStatusUpdated) onStatusUpdated();
    } catch (err) {
      console.error("[PayrollDetailsModal] Failed to save adjustments:", err);
      pushToast({
        title: "Save failed",
        description: "An error occurred while saving adjustments.",
        tone: "error",
      });
    } finally {
      setIsSavingAdjustments(false);
    }
  };

  // Payslip Slip - Option B: Dynamic calculations
  const lateDeduction = lateOnhold + lateRemittance;
  const totalEarnings = grossPay + otherEarnings + (fmPickupCount * 3);
  const totalDeductions = deductions + lateDeduction;
  const netSalary = totalEarnings - totalDeductions;

  const isAdjustmentsChanged =
    otherEarnings !== Number(record.other_earnings ?? 0) ||
    fmPickupCount !== Number(record.fm_pickup_count ?? 0) ||
    deductions !== Number(record.deductions ?? 0) ||
    lateOnhold !== Number(record.late_onhold ?? 0) ||
    lateRemittance !== Number(record.late_remittance ?? 0);

  // Action updates status in database
  const handleUpdateStatus = async (
    newStatus: "approved" | "paid" | "flagged" | "pending",
  ) => {
    setIsUpdatingStatus(true);
    try {
      await updatePayrollRecordStatus(record.id, newStatus);

      // Log this action to activity_logs
      await supabase.from("activity_logs").insert({
        user_id: (await supabase.auth.getUser()).data.user?.id || null,
        event_type: "payroll_status_update",
        description: `Updated payroll status for ${riderName} (${record.cutoff_start} to ${record.cutoff_end}) to ${newStatus}`,
        metadata: { record_id: record.id, new_status: newStatus },
      });

      pushToast({
        title: `Payroll marked as ${newStatus}`,
        description: `Successfully updated ${riderName}'s cutoff status.`,
        tone: "success",
      });
      if (onStatusUpdated) onStatusUpdated();
    } catch (err) {
      console.error("[PayrollDetailsModal] Failed to update status:", err);
      pushToast({
        title: "Status update failed",
        description: "An error occurred while writing to Supabase.",
        tone: "error",
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleExportPDF = () => {
    try {
      const mappedEntries = dayEntries.map((e) => ({
        date: e.date,
        parcels: e.parcels,
        rate: e.rate,
        dailyGross: e.dailyGross,
      }));
      exportParcelPayslipPDF(
        riderName,
        riderMkbId,
        zoneName,
        record.cutoff_start,
        record.cutoff_end,
        ratePerParcel,
        mappedEntries,
      );
      pushToast({
        title: "PDF Exported",
        description: `Payslip downloaded for ${riderName}`,
        tone: "success",
      });
    } catch (err) {
      console.error("[PayrollDetailsModal] PDF export failed:", err);
      pushToast({
        title: "PDF Export failed",
        description: "Please try again.",
        tone: "error",
      });
    }
  };

  const handleExportExcel = async () => {
    try {
      const mappedEntries = dayEntries.map((e) => ({
        date: e.date,
        parcels: e.parcels,
        rate: e.rate,
        dailyGross: e.dailyGross,
      }));

      let atmNumber = 'N/A';
      const notesStr = record.riders?.notes || '';
      const match = notesStr.match(/ATM\s*Number:\s*(\d+)/i) || notesStr.match(/ATM:\s*(\d+)/i) || notesStr.match(/ATM\s*#?\s*(\d+)/i);
      if (match) {
        atmNumber = match[1];
      }

      await exportParcelPayslipXLSX(
        riderName,
        riderMkbId,
        record.cutoff_start,
        record.cutoff_end,
        mappedEntries,
        atmNumber,
        {
          otherEarnings,
          fmPickupCount,
          deductions,
          lateOnhold,
          lateRemittance
        }
      );

      pushToast({
        title: "Excel Exported",
        description: `Payslip spreadsheet downloaded for ${riderName}`,
        tone: "success",
      });
    } catch (err) {
      console.error("[PayrollDetailsModal] Excel export failed:", err);
      pushToast({
        title: "Excel Export failed",
        description: "Please try again.",
        tone: "error",
      });
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[1200] flex items-center justify-center md:justify-end p-4 md:p-6 lg:p-8 ${role !== "rider" ? "md:left-64" : ""}`}
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-[#1A1410]/20 backdrop-blur-sm"
      />

      {/* Modal Container */}
      <motion.div
        initial={{ opacity: 0, x: 120, scale: 0.98 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 120, scale: 0.98 }}
        transition={{ type: "spring", damping: 28, stiffness: 220 }}
        className="relative bg-white border border-[#EFEAE2] shadow-2xl rounded-2xl w-full max-w-[95vw] lg:max-w-[92vw] xl:max-w-[85vw] 2xl:max-w-[80vw] overflow-hidden z-10 font-[Geist,sans-serif] flex flex-col h-[92vh] max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-[#EFEAE2] flex items-center justify-between shrink-0 bg-[#FAFAF7]">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-[#1A1410]">
              Payroll Details
            </h3>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusInfo.bg} ${statusInfo.text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
              {statusInfo.label}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Navigation arrows (if provided) */}
            {(onPrev || onNext) && (
              <div className="flex items-center border border-[#EFEAE2] rounded-lg bg-white overflow-hidden p-0.5">
                {indexLabel && (
                  <span className="px-2.5 text-[11px] font-mono text-[#6B6258] border-r border-[#EFEAE2]">
                    {indexLabel}
                  </span>
                )}
                <button
                  disabled={!hasPrev}
                  onClick={onPrev}
                  className="p-1.5 text-[#6B6258] hover:text-[#1A1410] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#FAFAF7] transition"
                  title="Previous Rider"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={!hasNext}
                  onClick={onNext}
                  className="p-1.5 text-[#6B6258] hover:text-[#1A1410] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#FAFAF7] transition"
                  title="Next Rider"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-[#EFEAE2] bg-white text-[#6B6258] hover:text-[#1A1410] hover:bg-[#FAFAF7] transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Content - Scrollable grid */}
        <div className="flex-1 overflow-y-auto lg:overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* LEFT SIDE: Employee Details and Daily Logs (Col 1-8) */}
          <div className="lg:col-span-8 p-5 space-y-5 border-r border-[#EFEAE2] overflow-y-auto">
            {/* Rider profile card */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-xl border border-[#EFEAE2] bg-[#FAFAF7]/50">
              <div className="w-14 h-14 rounded-full bg-white border border-[#EFEAE2] flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                {riderAvatar ? (
                  <img
                    src={riderAvatar}
                    alt={riderName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <UserIcon className="w-6 h-6 text-[#A39988]" />
                )}
              </div>

              <div className="text-center sm:text-left space-y-1">
                <h4 className="text-base font-bold text-[#1A1410]">
                  {riderName}
                </h4>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 text-xs text-[#6B6258] font-mono">
                  <span>
                    Code:{" "}
                    <span className="font-semibold text-[#1A1410]">
                      {riderMkbId}
                    </span>
                  </span>
                  <span className="hidden sm:inline">·</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#db6c00]" />
                    {zoneName}
                  </span>
                  <span className="hidden sm:inline">·</span>
                  <span>
                    Shift:{" "}
                    <span className="font-semibold capitalize text-[#1A1410]">
                      {shiftText}
                    </span>
                  </span>
                </div>
              </div>

              {role !== "rider" && (
                <div className="sm:ml-auto">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase border border-[#EFEAE2] rounded-lg bg-white text-[#6B6258]">
                    <Building className="w-3.5 h-3.5 text-[#db6c00]" />
                    Manager View
                  </span>
                </div>
              )}
            </div>

            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#db6c00]" />
                <span className="text-sm text-[#6B6258]">
                  Fetching performance telemetry metrics...
                </span>
              </div>
            ) : (
              <>
                {/* Metrics Cards Grid */}
                <PayrollMetricsGrid
                  presentCount={presentCount}
                  lateCount={lateCount}
                  violationCount={violationCount}
                  avgDailyParcels={avgDailyParcels}
                />

                {/* Day Details Timeline Banner */}
                <SelectedDayDetails
                  selectedDate={selectedDate}
                  selectedDayAtt={selectedDayAtt || null}
                  selectedDayLog={selectedDayLog || null}
                  selectedDayViolations={selectedDayViolations}
                />

                {/* Daily Breakdown Table */}
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wider text-[#6B6258] font-bold font-sans">
                    Daily Log Breakdown
                  </div>
                  <AttendanceLogsTable
                    dayEntries={dayEntries}
                    selectedDate={selectedDate}
                    setSelectedDate={setSelectedDate}
                    attendanceLogs={metrics?.attendanceLogs || []}
                    violations={metrics?.violations || []}
                  />
                </div>
              </>
            )}
          </div>

          {/* RIGHT SIDE: Payslip Slip Voucher (Col 9-12) */}
          <div className="lg:col-span-4 p-5 bg-[#FAFAF7] flex flex-col justify-between overflow-y-auto">
            <PayslipSlipCard
              record={record}
              role={role}
              grossPay={grossPay}
              rateBreakdown={rateBreakdown}
              ratePerParcel={ratePerParcel}
              otherEarnings={otherEarnings}
              setOtherEarnings={setOtherEarnings}
              fmPickupCount={fmPickupCount}
              setFmPickupCount={setFmPickupCount}
              deductions={deductions}
              setDeductions={setDeductions}
              lateOnhold={lateOnhold}
              setLateOnhold={setLateOnhold}
              lateRemittance={lateRemittance}
              setLateRemittance={setLateRemittance}
              totalEarnings={totalEarnings}
              totalDeductions={totalDeductions}
              netSalary={netSalary}
              isAdjustmentsChanged={isAdjustmentsChanged}
              isSavingAdjustments={isSavingAdjustments}
              handleSaveAdjustments={handleSaveAdjustments}
            />

            {/* Manager Actions / Rider actions */}
            <div className="mt-5 space-y-2 shrink-0">
              {role !== "rider" ? (
                // Manager Options
                <div className="space-y-2">
                  {record.status !== "paid" && (
                    <div className="flex gap-2">
                      <button
                        disabled={isUpdatingStatus}
                        onClick={() => handleUpdateStatus("paid")}
                        className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50"
                      >
                        {isUpdatingStatus ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        Pay Payroll
                      </button>

                      {record.status !== "approved" && (
                        <button
                          disabled={isUpdatingStatus}
                          onClick={() => handleUpdateStatus("approved")}
                          className="h-9 px-3 border border-[#EFEAE2] bg-white hover:bg-[#FAFAF7] text-[#1A1410] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50"
                          title="Approve Vouchers"
                        >
                          Approve
                        </button>
                      )}

                      {record.status !== "flagged" && (
                        <button
                          disabled={isUpdatingStatus}
                          onClick={() => handleUpdateStatus("flagged")}
                          className="h-9 px-3 bg-red-50 hover:bg-red-100 border border-red-200/50 text-red-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                          title="Flag for discrepancies"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      )}
                    </div>
                  )}

                  {record.status === "paid" && (
                    <div className="h-9 w-full bg-emerald-50 border border-emerald-500/20 text-emerald-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      Paid and Disbursed
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleExportPDF}
                      className="flex-1 h-9 border border-[#EFEAE2] bg-white hover:bg-[#FAFAF7] text-[#1A1410] rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition"
                    >
                      <Printer className="w-3.5 h-3.5 text-[#db6c00]" />
                      PDF
                    </button>

                    <button
                      onClick={handleExportExcel}
                      className="flex-1 h-9 border border-[#EFEAE2] bg-white hover:bg-[#FAFAF7] text-[#1A1410] rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      Excel
                    </button>

                    <button
                      onClick={() => {
                        try {
                          const mappedEntries = dayEntries.map((e) => ({
                            date: e.date,
                            parcels: e.parcels,
                            dailyGross: e.dailyGross,
                          }));
                          exportParcelCSV(
                            riderName,
                            riderMkbId,
                            record.cutoff_start,
                            record.cutoff_end,
                            ratePerParcel,
                            mappedEntries,
                          );
                          pushToast({
                            title: "CSV Exported",
                            description: "Voucher downloaded in CSV format.",
                            tone: "success",
                          });
                        } catch {
                          pushToast({
                            title: "CSV Export failed",
                            tone: "error",
                          });
                        }
                      }}
                      className="h-9 px-2 border border-[#EFEAE2] bg-white hover:bg-[#FAFAF7] text-[#1A1410] rounded-lg text-[11px] font-semibold flex items-center justify-center transition"
                      title="Export CSV"
                    >
                      <Download className="w-3.5 h-3.5 text-[#6B6258]" />
                    </button>
                  </div>
                </div>
              ) : (
                // Rider Options
                <div className="space-y-2">
                  <button
                    onClick={handleExportPDF}
                    className="w-full h-9 bg-[#db6c00] hover:bg-[#b85a00] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Payslip PDF
                  </button>

                  <button
                    onClick={handleExportExcel}
                    className="w-full h-9 border border-[#EFEAE2] bg-white hover:bg-[#FAFAF7] text-[#1A1410] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    Download Payslip Excel
                  </button>

                  <p className="text-[10px] text-[#A39988] text-center">
                    Contact HR or Payroll for wage corrections or discrepancy
                    reports.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
