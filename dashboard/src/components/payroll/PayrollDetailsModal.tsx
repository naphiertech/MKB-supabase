import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../hooks/useAuth";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
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
import { logActivity } from "../../lib/apiService";
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
  submitted_by?: string;
  submitted_at?: string;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  rejection_reason?: string;
  paid_by?: string;
  paid_at?: string;
  created_at?: string;
  updated_at?: string;
  submitted_user?: { full_name: string } | null;
  approved_user?: { full_name: string } | null;
  rejected_user?: { full_name: string } | null;
  paid_user?: { full_name: string } | null;
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
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<PayrollMetrics | null>(null);
  const [dayEntries, setDayEntries] = useState<ParcelLog[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReasonInput, setRejectionReasonInput] = useState("");
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
      await logActivity({
        eventType: "payroll_adjustments_update",
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
    newStatus: "approved" | "paid" | "flagged" | "pending" | "rejected" | "draft",
    rejectionReason?: string
  ) => {
    setIsUpdatingStatus(true);
    try {
      const userId = user?.id || "";
      await updatePayrollRecordStatus(record.id, newStatus, {
        userId,
        rejectionReason
      });

      // Log this action to activity_logs
      await logActivity({
        eventType: "payroll_status_update",
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
        {
          otherEarnings,
          fmPickupCount,
          deductions,
          lateOnhold,
          lateRemittance
        }
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

  return createPortal(
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-[#1A1410]/25 backdrop-blur-sm z-[1200]"
      />

      {/* Drawer Container */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "tween", duration: 0.3, ease: "easeOut" }}
        className="fixed top-0 bottom-0 right-0 h-full w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl xl:max-w-[70vw] 2xl:max-w-[60vw] bg-white border-l border-[#EFEAE2] shadow-[0_0_50px_rgba(26,20,16,0.15)] flex flex-col z-[1201] font-[Geist,sans-serif]"
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
            <div className="space-y-4">
              {/* Workflow Timeline */}
              <div className="bg-white border border-[#EFEAE2] rounded-xl p-3.5 shadow-sm space-y-3">
                <div className="text-[10px] uppercase tracking-wider text-[#6B6258] font-bold">
                  Workflow Timeline & Audit
                </div>
                
                <div className="relative pl-4 space-y-3 border-l-2 border-[#EFEAE2]">
                  {/* Draft State */}
                  <div className="relative">
                    <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border bg-white ${
                      record.status === 'draft' ? 'border-[#db6c00] bg-[#db6c00] ring-4 ring-[#db6c00]/10' : 'border-[#A39988]'
                    }`} />
                    <div className="text-[11px] font-semibold text-[#1A1410]">Draft Prepared</div>
                    <div className="text-[9.5px] text-[#6B6258]">Initial payroll worksheet setup</div>
                  </div>

                  {/* Submitted State */}
                  <div className="relative">
                    <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border bg-white ${
                      record.status === 'pending' ? 'border-[#db6c00] bg-[#db6c00] ring-4 ring-[#db6c00]/10' :
                      (record.submitted_at || ['approved', 'paid'].includes(record.status)) ? 'border-[#db6c00] bg-[#db6c00]' : 'border-[#EFEAE2]'
                    }`} />
                    <div className="text-[11px] font-semibold text-[#1A1410]">Submitted for Review</div>
                    {record.submitted_at ? (
                      <div className="text-[9.5px] text-[#6B6258]">
                        By {record.submitted_user?.full_name || 'Payroll Officer'} on {new Date(record.submitted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    ) : (
                      <div className="text-[9.5px] text-[#A39988] italic">Awaiting submission</div>
                    )}
                  </div>

                  {/* Approved/Rejected State */}
                  <div className="relative">
                    <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border bg-white ${
                      record.status === 'approved' ? 'border-[#db6c00] bg-[#db6c00] ring-4 ring-[#db6c00]/10' :
                      record.status === 'rejected' ? 'border-rose-500 bg-rose-500 ring-4 ring-rose-500/10' :
                      record.status === 'paid' ? 'border-[#db6c00] bg-[#db6c00]' : 'border-[#EFEAE2]'
                    }`} />
                    <div className="text-[11px] font-semibold text-[#1A1410]">
                      {record.status === 'rejected' ? 'Rejected' : 'Approved by Management'}
                    </div>
                    {record.status === 'rejected' && record.rejected_at ? (
                      <div className="text-[9.5px] text-rose-600">
                        By {record.rejected_user?.full_name || 'Admin'} on {new Date(record.rejected_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    ) : record.approved_at ? (
                      <div className="text-[9.5px] text-[#6B6258]">
                        By {record.approved_user?.full_name || 'Admin'} on {new Date(record.approved_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    ) : (
                      <div className="text-[9.5px] text-[#A39988] italic">Awaiting validation</div>
                    )}
                  </div>

                  {/* Paid State */}
                  <div className="relative">
                    <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border bg-white ${
                      record.status === 'paid' ? 'border-emerald-500 bg-emerald-500 ring-4 ring-emerald-500/10' : 'border-[#EFEAE2]'
                    }`} />
                    <div className="text-[11px] font-semibold text-[#1A1410]">Paid & Disbursed</div>
                    {record.paid_at ? (
                      <div className="text-[9.5px] text-emerald-600">
                        Disbursed on {new Date(record.paid_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    ) : (
                      <div className="text-[9.5px] text-[#A39988] italic">Awaiting disbursal</div>
                    )}
                  </div>
                </div>

                {/* Audit Details */}
                <div className="border-t border-[#EFEAE2] pt-3.5 space-y-1.5 text-[10.5px]">
                  <div className="flex justify-between">
                    <span className="text-[#6B6258]">Prepared By:</span>
                    <span className="font-semibold text-[#1A1410] truncate max-w-[150px]">
                      {record.submitted_user?.full_name || 'Payroll Officer'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6B6258]">Last Updated:</span>
                    <span className="font-mono text-[#1A1410]">
                      {new Date(record.updated_at || record.created_at || new Date().toISOString()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>

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
            </div>

            {/* Manager Actions / Rider actions */}
            <div className="mt-5 space-y-3 shrink-0 border-t border-[#EFEAE2] pt-4">
              {role !== "rider" ? (
                <div className="space-y-3">
                  {/* Rejection Form */}
                  {showRejectForm && (
                    <div className="p-3 border border-red-200 bg-red-50/50 rounded-lg space-y-2">
                      <div className="text-xs font-semibold text-red-800">Specify Rejection Reason</div>
                      <textarea
                        value={rejectionReasonInput}
                        onChange={(e) => setRejectionReasonInput(e.target.value)}
                        placeholder="Please detail why this payroll record is being rejected..."
                        className="w-full h-16 p-2 text-xs border border-red-200 bg-white rounded focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none resize-none transition font-sans"
                      />
                      <div className="flex gap-2">
                        <button
                          disabled={isUpdatingStatus}
                          onClick={() => {
                            if (!rejectionReasonInput.trim()) {
                              pushToast({ title: "Reason required", description: "Please enter a rejection reason.", tone: "error" });
                              return;
                            }
                            handleUpdateStatus("rejected", rejectionReasonInput);
                            setShowRejectForm(false);
                          }}
                          className="flex-1 h-8 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold flex items-center justify-center gap-1 transition"
                        >
                          Confirm Rejection
                        </button>
                        <button
                          onClick={() => {
                            setShowRejectForm(false);
                            setRejectionReasonInput("");
                          }}
                          className="px-3 h-8 border border-red-200 bg-white hover:bg-red-50 text-red-700 rounded text-xs font-semibold transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Rejection Reason Display */}
                  {!showRejectForm && record.status === "rejected" && record.rejection_reason && (
                    <div className="p-3 border border-rose-200 bg-rose-50/30 rounded-lg">
                      <div className="text-[10px] uppercase font-bold text-rose-800 tracking-wider">Rejection Reason</div>
                      <div className="text-xs text-rose-700 mt-1 italic">
                        "{record.rejection_reason}"
                      </div>
                      {record.rejected_user?.full_name && (
                        <div className="text-[9px] text-rose-600 mt-1 font-semibold text-right">
                          — Rejected by {record.rejected_user.full_name}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Role-based action buttons */}
                  {!showRejectForm && (
                    <div className="space-y-2">
                      {role === "payroll" && (
                        <div className="space-y-2">
                          {(record.status === "draft" || record.status === "rejected" || record.status === "flagged") ? (
                            <button
                              disabled={isUpdatingStatus}
                              onClick={() => handleUpdateStatus("pending")}
                              className="w-full h-9 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50"
                            >
                              {isUpdatingStatus ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}
                              Submit for Approval
                            </button>
                          ) : (
                            <div className="h-9 w-full bg-[#FAFAF7] border border-[#EFEAE2] text-[#6B6258] rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 italic">
                              {record.status === "pending" && "Submitted. Awaiting review."}
                              {record.status === "approved" && "Approved. Awaiting disbursal."}
                              {record.status === "paid" && "Paid and Disbursed."}
                            </div>
                          )}
                        </div>
                      )}

                      {(role === "admin" || role === "hr") && (
                        <div className="space-y-2">
                          {record.status === "pending" && (
                            <div className="flex flex-col gap-2">
                              <div className="flex gap-2">
                                <button
                                  disabled={isUpdatingStatus}
                                  onClick={() => handleUpdateStatus("approved")}
                                  className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50"
                                >
                                  Approve Payroll
                                </button>
                                <button
                                  disabled={isUpdatingStatus}
                                  onClick={() => setShowRejectForm(true)}
                                  className="flex-1 h-9 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </div>
                              <button
                                disabled={isUpdatingStatus}
                                onClick={() => handleUpdateStatus("draft")}
                                className="w-full h-8 border border-[#EFEAE2] bg-white hover:bg-[#FAFAF7] text-[#6B6258] rounded-lg text-xs font-semibold transition"
                              >
                                Return for Revision
                              </button>
                            </div>
                          )}

                          {record.status === "approved" && (
                            <button
                              disabled={isUpdatingStatus}
                              onClick={() => handleUpdateStatus("paid")}
                              className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50"
                            >
                              {isUpdatingStatus ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}
                              Mark as Paid
                            </button>
                          )}

                          {record.status === "paid" && (
                            <div className="h-9 w-full bg-emerald-50 border border-emerald-500/20 text-emerald-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              Paid and Disbursed
                            </div>
                          )}

                          {(record.status === "draft" || record.status === "rejected") && (
                            <div className="h-9 w-full bg-[#FAFAF7] border border-[#EFEAE2] text-[#6B6258] rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 italic">
                              Awaiting payroll officer submission.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Export Options */}
                  <div className="flex gap-2 pt-2 border-t border-[#EFEAE2]/50">
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
                            {
                              otherEarnings,
                              fmPickupCount,
                              deductions,
                              lateOnhold,
                              lateRemittance
                            }
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
    </>,
    document.body
  );
}
