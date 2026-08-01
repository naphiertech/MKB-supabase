import { Calendar, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { type PayrollMetrics } from "../../services/parcelService";

interface SelectedDayDetailsProps {
  selectedDate: string | null;
  selectedDayAtt: {
    time_in?: string | null;
    time_out?: string | null;
    status?: string | null;
    hours?: number | null;
    notes?: string | null;
  } | null;
  selectedDayLog: {
    parcels?: number;
  } | null;
  selectedDayViolations: PayrollMetrics["violations"];
}

export function SelectedDayDetails({
  selectedDate,
  selectedDayAtt,
  selectedDayLog,
  selectedDayViolations,
}: SelectedDayDetailsProps) {
  if (!selectedDate) return null;

  return (
    <div className="p-4 border border-border rounded-xl space-y-3 bg-panel-bg">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-primary" />
          {new Date(selectedDate).toLocaleDateString("en-PH", {
            weekday: "long",
            month: "long",
            day: "2-digit",
            year: "numeric",
          })}
        </div>
        <span className="text-[11px] font-mono text-muted-foreground">
          Day Details
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2 border-y border-border text-xs">
        <div>
          <div className="text-muted-foreground mb-0.5">Clock In</div>
          <div className="font-semibold font-mono text-foreground flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-primary" />
            {selectedDayAtt?.time_in ? (
              (() => {
                const val = selectedDayAtt.time_in;
                const d = new Date(val);
                if (!isNaN(d.getTime())) {
                  return d.toLocaleTimeString("en-PH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                }
                if (/^\d{1,2}:\d{2}$/.test(val)) {
                  const [hStr, mStr] = val.split(':');
                  let h = parseInt(hStr, 10);
                  const ampm = h >= 12 ? 'PM' : 'AM';
                  h = h % 12 || 12;
                  return `${h}:${mStr} ${ampm}`;
                }
                return val;
              })()
            ) : (
              <span className="text-subtle-text font-sans font-normal">
                —
              </span>
            )}
          </div>
        </div>

        <div>
          <div className="text-muted-foreground mb-0.5">Clock Out</div>
          <div className="font-semibold font-mono text-foreground flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-primary" />
            {selectedDayAtt?.time_out ? (
              new Date(
                selectedDayAtt.time_out.replace(" ", "T"),
              ).toLocaleTimeString("en-PH", {
                hour: "2-digit",
                minute: "2-digit",
              })
            ) : (
              <span className="text-subtle-text font-sans font-normal">
                —
              </span>
            )}
          </div>
        </div>

        <div>
          <div className="text-muted-foreground mb-0.5">Late Time</div>
          <div className="font-semibold text-foreground">
            {selectedDayAtt?.status === "late" ? (
              <span className="text-amber-600 font-semibold">
                Flagged Late
              </span>
            ) : selectedDayAtt?.status === "present" ? (
              <span className="text-emerald-600">On Time</span>
            ) : (
              <span className="text-subtle-text font-normal">—</span>
            )}
          </div>
        </div>

        <div>
          <div className="text-muted-foreground mb-0.5">Delivered</div>
          <div className="font-semibold font-mono text-foreground">
            {selectedDayLog?.parcels ?? 0} pcs
          </div>
        </div>
      </div>

      {/* Geofence Breach Banner */}
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
                .map((v) => v.zone_name || "Zone Boundary")
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
  );
}
