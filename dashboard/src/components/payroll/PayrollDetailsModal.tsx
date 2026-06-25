import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Printer,
  Download,
  Shield,
  Loader2,
  User as UserIcon,
  MapPin,
  Building,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import {
  getRiderPayrollMetrics,
  getParcelLogs,
  updatePayrollRecordStatus,
  type PayrollMetrics,
  type ParcelLog,
} from "../../services/parcelService";
import {
  exportParcelPayslipPDF,
  exportParcelCSV,
} from "../../lib/payrollExport";
import { pushToast } from "../../hooks/useToast";

interface PayrollDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: {
    id: string;
    rider_id: string;
    cutoff_start: string;
    cutoff_end: string;
    total_parcels: number;
    rate_per_parcel: number | null;
    gross_pay: number | null;
    status: string;
    riders: {
      name: string;
      mkb_id: string;
      face_image_url?: string | null;
      avatar_url?: string | null;
      zones?: { name: string } | null;
      shift?: string | null;
    } | null;
  } | null;
  onStatusUpdated?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  role: "admin" | "hr" | "payroll" | "rider";
  indexLabel?: string; // e.g. "3 of 12"
}

function phpFmt(n: number) {
  return `₱${n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

  // Load metrics & logs when record changes
  useEffect(() => {
    if (!record || !isOpen) return;

    let active = true;
    const loadDetails = async () => {
      setLoading(true);
      try {
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
          setMetrics(fetchedMetrics);
          setDayEntries(fetchedLogs);

          // Default selected day to the latest day with parcel deliveries, or just the first day in logs
          const withDeliveries = fetchedLogs.filter((l) => l.parcels > 0);
          if (withDeliveries.length > 0) {
            setSelectedDate(withDeliveries[withDeliveries.length - 1].date);
          } else if (fetchedLogs.length > 0) {
            setSelectedDate(fetchedLogs[fetchedLogs.length - 1].date);
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

  if (!isOpen || !record) return null;

  const riderName = record.riders?.name || "Unknown Rider";
  const riderMkbId = record.riders?.mkb_id || "MKB-RIDER";
  const zoneName = record.riders?.zones?.name || "Zamboanga City";
  const shiftText = record.riders?.shift || "Morning";
  const ratePerParcel = record.rate_per_parcel ?? 50;
  const grossPay = record.gross_pay ?? record.total_parcels * ratePerParcel;

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

  // Payslip Slip - Deductions are locked to 0.00 as requested
  const lateDeduction = 0;
  const violationDeduction = 0;
  const totalDeductions = 0;
  const netSalary = grossPay - totalDeductions;

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

  return (
    <div
      className={`fixed inset-0 z-[1200] overflow-y-auto flex items-center justify-center md:justify-end p-4 md:p-8 ${role !== "rider" ? "md:left-64" : ""}`}
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
        className="relative bg-white border border-[#EFEAE2] shadow-2xl rounded-2xl w-full max-w-6xl xl:max-w-7xl overflow-hidden z-10 font-[Geist,sans-serif] flex flex-col max-h-[90vh]"
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
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
          {/* LEFT SIDE: Employee Details and Daily Logs (Col 1-8) */}
          <div className="lg:col-span-8 p-5 space-y-5 border-r border-[#EFEAE2] overflow-y-auto">
            {/* Rider profile card */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-xl border border-[#EFEAE2] bg-[#FAFAF7]/50">
              <div className="w-14 h-14 rounded-full bg-white border border-[#EFEAE2] flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                {record.riders?.face_image_url || record.riders?.avatar_url ? (
                  <img
                    src={
                      record.riders.face_image_url ||
                      record.riders.avatar_url ||
                      ""
                    }
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-emerald-50/50 border border-emerald-500/10 rounded-xl">
                    <div className="text-[10px] uppercase tracking-wider text-emerald-800 font-semibold mb-1">
                      Present Days
                    </div>
                    <div className="text-2xl font-bold text-emerald-950 font-mono">
                      {presentCount}{" "}
                      <span className="text-xs font-normal text-emerald-800 font-sans">
                        days
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50/50 border border-amber-500/10 rounded-xl">
                    <div className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold mb-1">
                      Late Days
                    </div>
                    <div className="text-2xl font-bold text-amber-950 font-mono">
                      {lateCount}{" "}
                      <span className="text-xs font-normal text-amber-800 font-sans">
                        days
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-red-50/50 border border-red-500/10 rounded-xl">
                    <div className="text-[10px] uppercase tracking-wider text-red-800 font-semibold mb-1">
                      Geofence Alerts
                    </div>
                    <div className="text-2xl font-bold text-red-950 font-mono">
                      {violationCount}{" "}
                      <span className="text-xs font-normal text-red-800 font-sans">
                        events
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-sky-50/50 border border-sky-500/10 rounded-xl">
                    <div className="text-[10px] uppercase tracking-wider text-sky-800 font-semibold mb-1">
                      Avg Daily Parcels
                    </div>
                    <div className="text-2xl font-bold text-sky-950 font-mono">
                      {avgDailyParcels.toFixed(1)}{" "}
                      <span className="text-xs font-normal text-sky-800 font-sans">
                        pcs
                      </span>
                    </div>
                  </div>
                </div>

                {/* Day Details Timeline Banner */}
                {selectedDate && (
                  <div className="p-4 border border-[#EFEAE2] rounded-xl space-y-3 bg-[#FAFAF7]">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-[#1A1410] flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-[#db6c00]" />
                        {new Date(selectedDate).toLocaleDateString("en-PH", {
                          weekday: "long",
                          month: "long",
                          day: "2-digit",
                          year: "numeric",
                        })}
                      </div>
                      <span className="text-[11px] font-mono text-[#6B6258]">
                        Day Details
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2 border-y border-[#EFEAE2] text-xs">
                      <div>
                        <div className="text-[#6B6258] mb-0.5">Clock In</div>
                        <div className="font-semibold font-mono text-[#1A1410] flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-[#db6c00]" />
                          {selectedDayAtt?.time_in ? (
                            new Date(
                              selectedDayAtt.time_in.replace(" ", "T"),
                            ).toLocaleTimeString("en-PH", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          ) : (
                            <span className="text-[#A39988] font-sans font-normal">
                              —
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-[#6B6258] mb-0.5">Clock Out</div>
                        <div className="font-semibold font-mono text-[#1A1410] flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-[#db6c00]" />
                          {selectedDayAtt?.time_out ? (
                            new Date(
                              selectedDayAtt.time_out.replace(" ", "T"),
                            ).toLocaleTimeString("en-PH", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          ) : (
                            <span className="text-[#A39988] font-sans font-normal">
                              —
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-[#6B6258] mb-0.5">Late Time</div>
                        <div className="font-semibold text-[#1A1410]">
                          {selectedDayAtt?.status === "late" ? (
                            <span className="text-amber-600 font-semibold">
                              Flagged Late
                            </span>
                          ) : selectedDayAtt?.status === "present" ? (
                            <span className="text-emerald-600">On Time</span>
                          ) : (
                            <span className="text-[#A39988] font-normal">
                              —
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-[#6B6258] mb-0.5">Delivered</div>
                        <div className="font-semibold font-mono text-[#1A1410]">
                          {selectedDayLog?.parcels ?? 0} pcs
                        </div>
                      </div>
                    </div>

                    {/* Show Geofence boundary exits for selected day */}
                    {selectedDayViolations.length > 0 ? (
                      <div className="flex items-start gap-2 text-xs bg-red-50 text-red-700 border border-red-200/50 rounded-lg p-2.5">
                        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">
                            Geofence Boundary Exits:
                          </span>{" "}
                          Logged {selectedDayViolations.length} boundary exit
                          alert{selectedDayViolations.length > 1 ? "s" : ""}{" "}
                          during shift hours.{" "}
                          <span className="text-red-900">
                            (
                            {selectedDayViolations
                              .map((v) => v.zone_name)
                              .join(", ")}
                            )
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        No geofence infractions or boundary alerts recorded on
                        this day.
                      </div>
                    )}
                  </div>
                )}

                {/* Daily Breakdown Table */}
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wider text-[#6B6258] font-bold">
                    Daily Log Breakdown
                  </div>

                  <div className="border border-[#EFEAE2] rounded-xl overflow-hidden bg-white">
                    <div className="max-h-[220px] overflow-y-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-[#FAFAF7] border-b border-[#EFEAE2] sticky top-0 z-10">
                          <tr className="text-[10px] uppercase text-[#6B6258] font-bold">
                            <th className="px-4 py-2.5">Date</th>
                            <th className="px-4 py-2.5 text-center">Status</th>
                            <th className="px-4 py-2.5 text-center font-mono">
                              Parcels
                            </th>
                            <th className="px-4 py-2.5 text-right">
                              Daily Gross
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EFEAE2]">
                          {dayEntries.map((day) => {
                            const isSelected = day.date === selectedDate;
                            const dayAtt = metrics?.attendanceLogs.find(
                              (a) => a.date === day.date,
                            );

                            // Check for violations on this day
                            const hasViol = metrics?.violations.some((v) => {
                              try {
                                return (
                                  new Date(v.created_at)
                                    .toISOString()
                                    .split("T")[0] === day.date &&
                                  (v.type === "boundary_exit" ||
                                    v.type === "idle_excess")
                                );
                              } catch {
                                return false;
                              }
                            });

                            return (
                              <tr
                                key={day.id}
                                onClick={() => setSelectedDate(day.date)}
                                className={`cursor-pointer transition ${isSelected ? "bg-[#FFF1E0]/50 font-semibold" : "hover:bg-[#FAFAF7]/60"}`}
                              >
                                <td className="px-4 py-2 font-mono text-[#1A1410]">
                                  {new Date(day.date).toLocaleDateString(
                                    "en-PH",
                                    {
                                      month: "long",
                                      day: "2-digit",
                                      year: "numeric",
                                    },
                                  )}
                                </td>
                                <td className="px-4 py-2 text-center">
                                  {dayAtt?.status === "present" ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-500/10">
                                      Present
                                    </span>
                                  ) : dayAtt?.status === "late" ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700 border border-amber-500/10">
                                      Late
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-50 text-gray-500 border border-gray-200">
                                      No Attendance
                                    </span>
                                  )}

                                  {hasViol && (
                                    <span className="ml-1.5 px-1 py-0.5 rounded text-[10px] bg-red-50 text-red-600 border border-red-100">
                                      GPS Alert
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-center font-mono tabular-nums text-[#1A1410]">
                                  {day.parcels}
                                </td>
                                <td className="px-4 py-2 text-right font-mono tabular-nums text-[#1A1410]">
                                  {day.parcels === 0
                                    ? "—"
                                    : phpFmt(day.dailyGross)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* RIGHT SIDE: Payslip Slip Voucher (Col 9-12) */}
          <div className="lg:col-span-4 p-5 bg-[#FAFAF7] flex flex-col justify-between overflow-y-auto">
            {/* Payslip Slip Card */}
            <div className="border border-[#EFEAE2] bg-white rounded-xl p-5 shadow-sm space-y-4">
              <div className="text-center space-y-1 pb-4 border-b border-[#EFEAE2] border-dashed">
                <div className="inline-flex p-1.5 rounded-lg bg-[#FFF1E0] ring-1 ring-[#db6c00]/20 mb-1">
                  <Shield className="w-5 h-5 text-[#db6c00]" />
                </div>
                <h4 className="text-xs uppercase tracking-[0.2em] font-extrabold text-[#1A1410]">
                  MKB Corporation
                </h4>
                <p className="text-[10px] text-[#6B6258] font-mono">
                  Cutoff:{" "}
                  {new Date(record.cutoff_start).toLocaleDateString("en-PH", {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  –{" "}
                  {new Date(record.cutoff_end).toLocaleDateString("en-PH", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>

              {/* Earnings Section */}
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-[#6B6258] font-bold">
                  Earnings
                </div>
                <div className="text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[#6B6258]">Base Delivery Pay</span>
                    <span className="font-mono tabular-nums text-[#1A1410]">
                      {phpFmt(grossPay)}
                    </span>
                  </div>
                  <div className="pl-3 text-[11px] text-[#6B6258]/80 flex justify-between font-mono">
                    <span>
                      ({record.total_parcels} parcels @ {phpFmt(ratePerParcel)}
                      /pc)
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-[#EFEAE2] font-semibold text-xs text-[#1A1410]">
                    <span>Total Earnings</span>
                    <span className="font-mono tabular-nums">
                      {phpFmt(grossPay)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Deductions Section (Deductions set to 0.00 as per instructions) */}
              <div className="space-y-2 pt-2">
                <div className="text-[10px] uppercase tracking-wider text-[#6B6258] font-bold">
                  Deductions
                </div>
                <div className="text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[#6B6258]">Late Penalties</span>
                    <span className="font-mono tabular-nums text-[#6B6258]">
                      {phpFmt(lateDeduction)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6B6258]">Geofence Violations</span>
                    <span className="font-mono tabular-nums text-[#6B6258]">
                      {phpFmt(violationDeduction)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-[#EFEAE2] font-semibold text-xs text-[#1A1410]">
                    <span>Total Deductions</span>
                    <span className="font-mono tabular-nums text-[#6B6258]">
                      {phpFmt(totalDeductions)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Total Salary Pinned */}
              <div className="pt-4 border-t border-dashed border-[#EFEAE2] flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#6B6258] font-bold">
                    Net Take-Home
                  </div>
                  <div className="text-[10.5px] text-[#A39988] font-mono leading-none mt-0.5">
                    Gross Pay less deductions
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold text-[#db6c00] font-mono tabular-nums">
                    {phpFmt(netSalary)}
                  </span>
                </div>
              </div>

              <div className="text-center text-[10px] text-[#A39988] italic pt-1">
                Generated dynamically via AttenRider System.
              </div>
            </div>

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
                      className="flex-1 h-9 border border-[#EFEAE2] bg-white hover:bg-[#FAFAF7] text-[#1A1410] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <Printer className="w-3.5 h-3.5 text-[#db6c00]" />
                      Print / PDF
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
                      className="h-9 px-3 border border-[#EFEAE2] bg-white hover:bg-[#FAFAF7] text-[#1A1410] rounded-lg text-xs font-semibold flex items-center justify-center transition"
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
