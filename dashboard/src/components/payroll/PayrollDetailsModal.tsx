import { useState, useEffect } from "react";
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
  getPayrollDeliveryData,
  updatePayrollRecordStatus,
  type OperationalParcelSummary,
  type PayrollMetrics,
  type ParcelLog,
} from "../../services/parcelService";
import { getCachedAvatar, setCachedAvatar, fetchRiderAvatar } from "../../lib/avatarCache";

import {
  exportParcelPayslipPDF,
  exportParcelCSV,
  exportParcelPayslipXLSX,
  parcelLogsToPayslipDays,
  type PayslipSnapshotContext,
} from "../../lib/exports/payrollExport";
import { pushToast } from "../../hooks/useToast";
import { logActivity } from "../../lib/apiService";
import { isEditableStatus } from "../../types/payroll";
import { PayrollMetricsGrid } from "./PayrollMetricsGrid";
import { SelectedDayDetails } from "./SelectedDayDetails";
import { AttendanceLogsTable } from "./AttendanceLogsTable";
import { PayslipSlipCard } from "./PayslipSlipCard";
import { useParcelLogsRealtimeVersion } from "../../hooks/useParcelLogsRealtimeVersion";
import { PayrollActorIdentity } from "./PayrollActorIdentity";

export interface PayrollRecordShape {
  id: string;
  rider_id: string;
  cutoff_start: string;
  cutoff_end: string;
  total_parcels: number;
  rate_per_parcel: number | null;
  gross_pay: number | null;
  standard_parcels?: number | null;
  heavy_parcels?: number | null;
  standard_earnings?: number | null;
  heavy_earnings?: number | null;
  rate_configuration_id?: string | null;
  calculation_version?: number | null;
  snapshot_finalized_at?: string | null;
  status: string;
  other_earnings?: number;
  fm_pickup_count?: number;
  deductions?: number;
  late_onhold?: number;
  late_remittance?: number;
  submitted_by?: string;
  submitted_at?: string;
  submitted_by_name_snapshot?: string | null;
  submitted_by_email_snapshot?: string | null;
  approved_by?: string;
  approved_at?: string;
  approved_by_name_snapshot?: string | null;
  approved_by_email_snapshot?: string | null;
  rejected_by?: string;
  rejected_at?: string;
  rejected_by_name_snapshot?: string | null;
  rejected_by_email_snapshot?: string | null;
  rejection_reason?: string;
  returned_by?: string;
  returned_at?: string;
  returned_by_name_snapshot?: string | null;
  returned_by_email_snapshot?: string | null;
  paid_by?: string;
  paid_at?: string;
  paid_by_name_snapshot?: string | null;
  paid_by_email_snapshot?: string | null;
  created_at?: string;
  updated_at?: string;
  submitted_user?: { full_name: string; email?: string } | null;
  approved_user?: { full_name: string; email?: string } | null;
  rejected_user?: { full_name: string; email?: string } | null;
  returned_user?: { full_name: string; email?: string } | null;
  paid_user?: { full_name: string; email?: string } | null;
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

function OperationalSummaryCard({ summary, source, calculationVersion }: { summary: OperationalParcelSummary; source: string; calculationVersion: number }) {
  const metrics = [
    { label: "Standard", value: summary.standardDelivered.toLocaleString(), tone: "text-foreground" },
    { label: "Heavy", value: summary.heavyDelivered.toLocaleString(), tone: "text-primary" },
    { label: "Failed", value: summary.failed.toLocaleString(), tone: "text-red-700" },
    { label: "Returned", value: summary.returned.toLocaleString(), tone: "text-amber-700" },
    { label: "Handled", value: summary.totalHandled.toLocaleString(), tone: "text-foreground" },
    { label: "Success", value: summary.successRate == null ? "—" : `${summary.successRate.toFixed(1)}%`, tone: "text-emerald-700" },
    { label: "Standard Pay", value: `₱${summary.standardEarnings.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`, tone: "text-foreground" },
    { label: "Heavy Pay", value: `₱${summary.heavyEarnings.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`, tone: "text-primary" },
    { label: "Gross Delivery", value: `₱${summary.grossDeliveryPay.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`, tone: "text-emerald-700" },
  ];

  return (
    <section className="rounded-xl border border-border bg-panel-bg/60 p-3.5" aria-labelledby="operational-summary-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 id="operational-summary-title" className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            Operational Summary
          </h4>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Read-only {source === "live" ? "Parcel Operations data" : "payroll snapshot"}</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          <FileSpreadsheet className="h-3 w-3 text-primary" /> {source === "legacy" ? "Legacy Snapshot" : `Calculation v${calculationVersion}`}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-border bg-white px-2.5 py-2">
            <dt className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{metric.label}</dt>
            <dd className={`mt-0.5 font-mono text-sm font-bold ${metric.tone}`}>{metric.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[9px] font-mono text-muted-foreground">
        Rate configuration: {summary.rateConfigurationIds.length > 0 ? summary.rateConfigurationIds.join(", ") : source === "legacy" ? "legacy aggregate snapshot" : "not available"}
      </p>
    </section>
  );
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
  const canExportPayroll = role !== 'rider' || user?.status !== 'suspended';
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<PayrollMetrics | null>(null);
  const [dayEntries, setDayEntries] = useState<ParcelLog[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReasonInput, setRejectionReasonInput] = useState("");
  const [riderAvatar, setRiderAvatar] = useState<string | null>(null);
  const [deliverySource, setDeliverySource] = useState<"live" | "snapshot" | "legacy">("live");
  const [calculationVersion, setCalculationVersion] = useState(2);
  const [operationalSummary, setOperationalSummary] = useState<OperationalParcelSummary>({
    delivered: 0, standardDelivered: 0, heavyDelivered: 0, failed: 0, returned: 0,
    totalHandled: 0, assigned: null, successRate: 0, standardEarnings: 0,
    heavyEarnings: 0, grossDeliveryPay: 0, rateConfigurationIds: [],
  });

  // Option B: Dynamic adjustments states
  const [otherEarnings, setOtherEarnings] = useState(0);
  const [fmPickupCount, setFmPickupCount] = useState(0);
  const [deductions, setDeductions] = useState(0);
  const [lateOnhold, setLateOnhold] = useState(0);
  const [lateRemittance, setLateRemittance] = useState(0);
  const [isSavingAdjustments, setIsSavingAdjustments] = useState(false);
  const parcelLogsVersion = useParcelLogsRealtimeVersion(
    record?.rider_id,
    record?.cutoff_start,
    record?.cutoff_end,
    isOpen
  );

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

        const shouldLoadLiveTelemetry = isEditableStatus(record.status);
        const [fetchedMetrics, deliveryData] = await Promise.all([
          shouldLoadLiveTelemetry ? getRiderPayrollMetrics(
            record.rider_id,
            record.cutoff_start,
            record.cutoff_end,
          ) : Promise.resolve<PayrollMetrics>({ presentDays: 0, lateDays: 0, violationsCount: 0, attendanceLogs: [], violations: [] }),
          getPayrollDeliveryData(record),
        ]);

        if (active) {
          setMetrics(fetchedMetrics);
          setDayEntries(deliveryData.lines);
          setOperationalSummary(deliveryData.summary);
          setDeliverySource(deliveryData.source);
          setCalculationVersion(deliveryData.calculationVersion);

          // Option B: Initialize adjustments state from record
          setOtherEarnings(Number(record.other_earnings ?? 0));
          setFmPickupCount(Number(record.fm_pickup_count ?? 0));
          setDeductions(Number(record.deductions ?? 0));
          setLateOnhold(Number(record.late_onhold ?? 0));
          setLateRemittance(Number(record.late_remittance ?? 0));

          // Default selected day to the latest day with parcel deliveries, or just the first day in logs
          const withDeliveries = deliveryData.lines.filter((l) => l.parcels + l.heavyParcels > 0);
          if (withDeliveries.length > 0) {
            setSelectedDate(withDeliveries[withDeliveries.length - 1].date);
          } else if (deliveryData.lines.length > 0) {
            setSelectedDate(deliveryData.lines[deliveryData.lines.length - 1].date);
          } else {
            setSelectedDate(null);
          }
        }
      } catch (err) {
        console.error("[PayrollDetailsModal] Failed to load details:", err);
        pushToast({
          title: "Error loading payroll details",
          description: err instanceof Error ? err.message : "Failed to load the payroll snapshot.",
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
  }, [record, isOpen, parcelLogsVersion]);

  if (!isOpen || !record) return null;

  const riderName = record.riders?.name || "Unknown Rider";
  const riderMkbId = record.riders?.mkb_id || "MKB-RIDER";
  const zoneName = record.riders?.zones?.name || "Zamboanga City";
  const shiftText = record.riders?.shift || "Morning";
  const computedGrossPay = dayEntries.reduce((sum, e) => sum + e.dailyGross, 0);
  const grossPay = record.gross_pay ?? computedGrossPay;
  const payslipDays = parcelLogsToPayslipDays(dayEntries);
  const snapshotContext: PayslipSnapshotContext = {
    source: deliverySource,
    calculationVersion,
    standardParcels: operationalSummary.standardDelivered,
    heavyParcels: operationalSummary.heavyDelivered,
    failedParcels: operationalSummary.failed,
    returnedParcels: operationalSummary.returned,
    standardEarnings: operationalSummary.standardEarnings,
    heavyEarnings: operationalSummary.heavyEarnings,
    grossDeliveryPay: operationalSummary.grossDeliveryPay,
  };
  const isExportReady = deliverySource === "legacy" || dayEntries.every(entry => Boolean(entry.rateConfigurationId));

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
          (v.type === "boundary_exit" || v.type === "idle_timeout")
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
    if (!canExportPayroll) {
      pushToast({ title: 'Account restricted', description: 'Payroll downloads are disabled until full access is restored.', tone: 'error' });
      return;
    }
    if (!isExportReady) {
      pushToast({
        title: "Rate requires review",
        description: "Required payroll rate snapshots are missing. Review this payroll before export.",
        tone: "error",
      });
      return;
    }
    try {
      exportParcelPayslipPDF(
        riderName,
        riderMkbId,
        zoneName,
        record.cutoff_start,
        record.cutoff_end,
        payslipDays,
        snapshotContext,
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
        description: err instanceof Error ? err.message : "Please try again.",
        tone: "error",
      });
    }
  };

  const handleExportExcel = async () => {
    if (!canExportPayroll) {
      pushToast({ title: 'Account restricted', description: 'Payroll downloads are disabled until full access is restored.', tone: 'error' });
      return;
    }
    if (!isExportReady) {
      pushToast({
        title: "Rate requires review",
        description: "Required payroll rate snapshots are missing. Review this payroll before export.",
        tone: "error",
      });
      return;
    }
    try {
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
        payslipDays,
        snapshotContext,
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
        description: err instanceof Error ? err.message : "Please try again.",
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
        className="fixed inset-0 bg-foreground/25 backdrop-blur-sm z-[1200]"
      />

      {/* Drawer Container */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "tween", duration: 0.3, ease: "easeOut" }}
        className="safe-drawer fixed top-0 bottom-0 right-0 flex w-full flex-col border-l border-border bg-white shadow-[0_0_50px_rgba(26,20,16,0.15)] sm:max-w-xl md:max-w-2xl lg:max-w-3xl xl:max-w-[70vw] 2xl:max-w-[60vw] z-[1201] font-[Geist,sans-serif]"
      >
        {/* Modal Header */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-panel-bg px-3 py-3 sm:px-5 sm:py-3.5">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <h3 className="text-base font-bold text-foreground">
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
              <div className="flex items-center border border-border rounded-lg bg-white overflow-hidden p-0.5">
                {indexLabel && (
                  <span className="px-2.5 text-[11px] font-mono text-muted-foreground border-r border-border">
                    {indexLabel}
                  </span>
                )}
                <button
                  disabled={!hasPrev}
                  onClick={onPrev}
                  className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-panel-bg transition"
                  title="Previous Rider"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={!hasNext}
                  onClick={onNext}
                  className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-panel-bg transition"
                  title="Next Rider"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-border bg-white text-muted-foreground hover:text-foreground hover:bg-panel-bg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!isExportReady && (
          <div className="mx-5 mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900" role="status">
            Required payroll rate snapshots are missing. Review this payroll before exporting.
          </div>
        )}

        {/* Modal Content - Scrollable grid */}
        <div className="flex-1 overflow-y-auto lg:overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* LEFT SIDE: Employee Details and Daily Logs (Col 1-8) */}
          <div className="lg:col-span-8 p-5 space-y-5 border-r border-border overflow-y-auto">
            {/* Rider profile card */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-xl border border-border bg-panel-bg/50">
              <div className="w-14 h-14 rounded-full bg-white border border-border flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                {riderAvatar ? (
                  <img
                    src={riderAvatar}
                    alt={riderName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <UserIcon className="w-6 h-6 text-subtle-text" />
                )}
              </div>

              <div className="text-center sm:text-left space-y-1">
                <h4 className="text-base font-bold text-foreground">
                  {riderName}
                </h4>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 text-xs text-muted-foreground font-mono">
                  <span>
                    Code:{" "}
                    <span className="font-semibold text-foreground">
                      {riderMkbId}
                    </span>
                  </span>
                  <span className="hidden sm:inline">·</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    {zoneName}
                  </span>
                  <span className="hidden sm:inline">·</span>
                  <span>
                    Shift:{" "}
                    <span className="font-semibold capitalize text-foreground">
                      {shiftText}
                    </span>
                  </span>
                </div>
              </div>

              {role !== "rider" && (
                <div className="sm:ml-auto">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase border border-border rounded-lg bg-white text-muted-foreground">
                    <Building className="w-3.5 h-3.5 text-primary" />
                    Manager View
                  </span>
                </div>
              )}
            </div>

            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
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

                <OperationalSummaryCard summary={operationalSummary} source={deliverySource} calculationVersion={calculationVersion} />

                {/* Day Details Timeline Banner */}
                <SelectedDayDetails
                  selectedDate={selectedDate}
                  selectedDayAtt={selectedDayAtt || null}
                  selectedDayLog={selectedDayLog || null}
                  selectedDayViolations={selectedDayViolations}
                />

                {/* Daily Breakdown Table */}
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold font-sans">
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
          <div className="lg:col-span-4 p-5 bg-panel-bg flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              {/* Workflow Timeline */}
              <div className="bg-white border border-border rounded-xl p-3.5 shadow-sm space-y-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Workflow Timeline & Audit
                </div>
                
                <div className="relative pl-4 space-y-3 border-l-2 border-border">
                  {/* Draft State */}
                  <div className="relative">
                    <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border bg-white ${
                      record.status === 'draft' ? 'border-primary bg-primary ring-4 ring-primary/10' : 'border-subtle-text'
                    }`} />
                    <div className="text-[11px] font-semibold text-foreground">Draft Prepared</div>
                    <div className="text-[9.5px] text-muted-foreground">Initial payroll worksheet setup</div>
                  </div>

                  {/* Submitted State */}
                  <div className="relative">
                    <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border bg-white ${
                      record.status === 'pending' ? 'border-primary bg-primary ring-4 ring-primary/10' :
                      (record.submitted_at || ['approved', 'paid'].includes(record.status)) ? 'border-primary bg-primary' : 'border-border'
                    }`} />
                    <div className="text-[11px] font-semibold text-foreground">Submitted for Review</div>
                    {record.submitted_at ? (
                      <div className="mt-0.5 text-[9.5px] text-muted-foreground">
                        <PayrollActorIdentity
                          snapshotName={record.submitted_by_name_snapshot}
                          snapshotEmail={record.submitted_by_email_snapshot}
                          currentName={record.submitted_user?.full_name}
                          currentEmail={record.submitted_user?.email}
                          legacyFallbackLabel="Payroll Officer"
                        />
                        <div className="mt-0.5">{new Date(record.submitted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    ) : (
                      <div className="text-[9.5px] text-subtle-text italic">Awaiting submission</div>
                    )}
                  </div>

                  {/* Approved/Rejected State */}
                  <div className="relative">
                    <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border bg-white ${
                      record.status === 'approved' ? 'border-primary bg-primary ring-4 ring-primary/10' :
                      record.status === 'rejected' ? 'border-rose-500 bg-rose-500 ring-4 ring-rose-500/10' :
                      record.status === 'paid' ? 'border-primary bg-primary' : 'border-border'
                    }`} />
                    <div className="text-[11px] font-semibold text-foreground">
                      {record.status === 'rejected' ? 'Rejected' : 'Approved by Management'}
                    </div>
                    {record.status === 'rejected' && record.rejected_at ? (
                      <div className="mt-0.5 text-[9.5px] text-rose-600">
                        <PayrollActorIdentity
                          snapshotName={record.rejected_by_name_snapshot}
                          snapshotEmail={record.rejected_by_email_snapshot}
                          currentName={record.rejected_user?.full_name}
                          currentEmail={record.rejected_user?.email}
                          legacyFallbackLabel="Admin / HR"
                          tone="danger"
                        />
                        <div className="mt-0.5">{new Date(record.rejected_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    ) : record.approved_at ? (
                      <div className="mt-0.5 text-[9.5px] text-muted-foreground">
                        <PayrollActorIdentity
                          snapshotName={record.approved_by_name_snapshot}
                          snapshotEmail={record.approved_by_email_snapshot}
                          currentName={record.approved_user?.full_name}
                          currentEmail={record.approved_user?.email}
                          legacyFallbackLabel="Admin / HR"
                        />
                        <div className="mt-0.5">{new Date(record.approved_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    ) : (
                      <div className="text-[9.5px] text-subtle-text italic">Awaiting validation</div>
                    )}
                  </div>

                  {/* Returned for Revision State */}
                  {record.returned_at && (
                    <div className="relative">
                      <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border border-amber-500 bg-amber-500" />
                      <div className="text-[11px] font-semibold text-foreground">Returned for Revision</div>
                      <div className="mt-0.5 text-[9.5px] text-muted-foreground">
                        <PayrollActorIdentity
                          snapshotName={record.returned_by_name_snapshot}
                          snapshotEmail={record.returned_by_email_snapshot}
                          currentName={record.returned_user?.full_name}
                          currentEmail={record.returned_user?.email}
                          legacyFallbackLabel="Admin / HR"
                        />
                        <div className="mt-0.5">{new Date(record.returned_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>
                  )}

                  {/* Paid State */}
                  <div className="relative">
                    <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border bg-white ${
                      record.status === 'paid' ? 'border-emerald-500 bg-emerald-500 ring-4 ring-emerald-500/10' : 'border-border'
                    }`} />
                    <div className="text-[11px] font-semibold text-foreground">Paid & Disbursed</div>
                    {record.paid_at ? (
                      <div className="mt-0.5 text-[9.5px] text-emerald-600">
                        <PayrollActorIdentity
                          snapshotName={record.paid_by_name_snapshot}
                          snapshotEmail={record.paid_by_email_snapshot}
                          currentName={record.paid_user?.full_name}
                          currentEmail={record.paid_user?.email}
                          legacyFallbackLabel="Admin / HR"
                          tone="success"
                        />
                        <div className="mt-0.5">{new Date(record.paid_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    ) : (
                      <div className="text-[9.5px] text-subtle-text italic">Awaiting disbursal</div>
                    )}
                  </div>
                </div>

                {/* Audit Details */}
                <div className="border-t border-border pt-3.5 space-y-1.5 text-[10.5px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Prepared By:</span>
                    <div className="max-w-[170px] text-right text-[9.5px]">
                      <PayrollActorIdentity
                        snapshotName={record.submitted_by_name_snapshot}
                        snapshotEmail={record.submitted_by_email_snapshot}
                        currentName={record.submitted_user?.full_name}
                        currentEmail={record.submitted_user?.email}
                        legacyFallbackLabel="Payroll Officer"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Updated:</span>
                    <span className="font-mono text-foreground">
                      {new Date(record.updated_at || record.created_at || new Date().toISOString()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>

              <PayslipSlipCard
                record={record}
                role={role}
                grossPay={grossPay}
                operationalSummary={operationalSummary}
                calculationVersion={calculationVersion}
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
            <div className="mt-5 space-y-3 shrink-0 border-t border-border pt-4">
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
                      {(record.rejected_by_name_snapshot || record.rejected_user?.full_name) && (
                        <div className="text-[9px] text-rose-600 mt-1 font-semibold text-right">
                          — Rejected by {record.rejected_by_name_snapshot || record.rejected_user?.full_name}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Role-based action buttons */}
                  {!showRejectForm && (
                    <div className="space-y-2">
                      {role === "payroll" && (
                        <div className="space-y-2">
                          {isEditableStatus(record.status) ? (
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
                            <div className="h-9 w-full bg-panel-bg border border-border text-muted-foreground rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 italic">
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
                                className="w-full h-8 border border-border bg-white hover:bg-panel-bg text-muted-foreground rounded-lg text-xs font-semibold transition"
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

                          {isEditableStatus(record.status) && (
                            <div className="h-9 w-full bg-panel-bg border border-border text-muted-foreground rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 italic">
                              Awaiting payroll officer submission.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Export Options */}
                  <div className="flex gap-2 pt-2 border-t border-border/50">
                    <button
                      onClick={handleExportPDF}
                      disabled={!isExportReady || !canExportPayroll}
                      className="flex-1 h-9 border border-border bg-white hover:bg-panel-bg text-foreground rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition"
                    >
                      <Printer className="w-3.5 h-3.5 text-primary" />
                      PDF
                    </button>

                    <button
                      onClick={handleExportExcel}
                      disabled={!isExportReady || !canExportPayroll}
                      className="flex-1 h-9 border border-border bg-white hover:bg-panel-bg text-foreground rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      Excel
                    </button>

                    <button
                      disabled={!isExportReady || !canExportPayroll}
                      onClick={() => {
                        if (!canExportPayroll) return;
                        try {
                          exportParcelCSV(
                            riderName,
                            riderMkbId,
                            record.cutoff_start,
                            record.cutoff_end,
                            payslipDays,
                            snapshotContext,
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
                        } catch (err) {
                          pushToast({
                            title: "CSV Export failed",
                            description: err instanceof Error ? err.message : "Please try again.",
                            tone: "error",
                          });
                        }
                      }}
                      className="h-9 px-2 border border-border bg-white hover:bg-panel-bg text-foreground rounded-lg text-[11px] font-semibold flex items-center justify-center transition"
                      title="Export CSV"
                    >
                      <Download className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              ) : (
                // Rider Options
                <div className="space-y-2">
                  <button
                    onClick={handleExportPDF}
                    disabled={!isExportReady || !canExportPayroll}
                    className="w-full h-9 bg-primary hover:bg-primary-hover text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Payslip PDF
                  </button>

                  <button
                    onClick={handleExportExcel}
                    disabled={!isExportReady || !canExportPayroll}
                    className="w-full h-9 border border-border bg-white hover:bg-panel-bg text-foreground rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    Download Payslip Excel
                  </button>

                  <p className="text-[10px] text-subtle-text text-center">
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
