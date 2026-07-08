
interface PayrollMetricsGridProps {
  presentCount: number;
  lateCount: number;
  violationCount: number;
  avgDailyParcels: number;
}

export function PayrollMetricsGrid({
  presentCount,
  lateCount,
  violationCount,
  avgDailyParcels,
}: PayrollMetricsGridProps) {
  return (
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
  );
}
