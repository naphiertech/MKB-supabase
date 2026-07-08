import { type ParcelLog, type PayrollMetrics } from "../../services/parcelService";

interface AttendanceLogsTableProps {
  dayEntries: ParcelLog[];
  selectedDate: string | null;
  setSelectedDate: (date: string | null) => void;
  attendanceLogs: PayrollMetrics["attendanceLogs"];
  violations: PayrollMetrics["violations"];
}

function phpFmt(n: number) {
  return `₱${n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function AttendanceLogsTable({
  dayEntries,
  selectedDate,
  setSelectedDate,
  attendanceLogs,
  violations,
}: AttendanceLogsTableProps) {
  return (
    <div className="overflow-x-auto border border-[#EFEAE2] rounded-xl bg-white shadow-sm">
      <table className="w-full text-xs text-left border-collapse">
        <thead>
          <tr className="bg-[#FAFAF7] border-b border-[#EFEAE2] text-[10px] uppercase tracking-wider text-[#6B6258] font-mono">
            <th className="px-4 py-2.5 font-semibold">Date</th>
            <th className="px-4 py-2.5 font-semibold text-center">Status</th>
            <th className="px-4 py-2.5 font-semibold text-center">Parcels</th>
            <th className="px-4 py-2.5 font-semibold text-center">Rate</th>
            <th className="px-4 py-2.5 font-semibold text-right">Gross Pay</th>
          </tr>
        </thead>
        <tbody>
          {dayEntries.map((day) => {
            const isSelected = selectedDate === day.date;
            const dayAtt = attendanceLogs.find((a) => a.date === day.date);
            const hasViol = (violations || []).some((v) => {
              try {
                const vDate = new Date(v.created_at).toISOString().split("T")[0];
                return (
                  vDate === day.date &&
                  (v.type === "boundary_exit" || v.type === "idle_excess")
                );
              } catch {
                return false;
              }
            });

            return (
              <tr
                key={day.id || day.date}
                onClick={() => setSelectedDate(day.date)}
                className={`cursor-pointer transition ${isSelected ? "bg-[#FFF1E0]/50 font-semibold" : "hover:bg-[#FAFAF7]/60"}`}
              >
                <td className="px-4 py-2 font-mono text-[#1A1410]">
                  {new Date(day.date).toLocaleDateString("en-PH", {
                    month: "long",
                    day: "2-digit",
                    year: "numeric",
                  })}
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
                <td className="px-4 py-2 text-center font-mono tabular-nums text-[#1A1410]">
                  ₱{day.rate.toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-[#1A1410]">
                  {day.parcels === 0 ? "—" : phpFmt(day.dailyGross)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
