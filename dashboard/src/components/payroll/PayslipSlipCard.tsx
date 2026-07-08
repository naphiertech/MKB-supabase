import { Shield, Loader2, CheckCircle2 } from "lucide-react";
import { type PayrollRecordShape } from "./PayrollDetailsModal";

interface PayslipSlipCardProps {
  record: PayrollRecordShape;
  role: "admin" | "hr" | "payroll" | "rider";
  grossPay: number;
  rateBreakdown: Array<{ rate: number; parcels: number; gross: number }>;
  ratePerParcel: number;
  otherEarnings: number;
  setOtherEarnings: (val: number) => void;
  fmPickupCount: number;
  setFmPickupCount: (val: number) => void;
  deductions: number;
  setDeductions: (val: number) => void;
  lateOnhold: number;
  setLateOnhold: (val: number) => void;
  lateRemittance: number;
  setLateRemittance: (val: number) => void;
  totalEarnings: number;
  totalDeductions: number;
  netSalary: number;
  isAdjustmentsChanged: boolean;
  isSavingAdjustments: boolean;
  handleSaveAdjustments: () => Promise<void>;
}

function phpFmt(n: number) {
  return `₱${n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function PayslipSlipCard({
  record,
  role,
  grossPay,
  rateBreakdown,
  ratePerParcel,
  otherEarnings,
  setOtherEarnings,
  fmPickupCount,
  setFmPickupCount,
  deductions,
  setDeductions,
  lateOnhold,
  setLateOnhold,
  lateRemittance,
  setLateRemittance,
  totalEarnings,
  totalDeductions,
  netSalary,
  isAdjustmentsChanged,
  isSavingAdjustments,
  handleSaveAdjustments,
}: PayslipSlipCardProps) {
  return (
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
          {rateBreakdown.length === 0 ? (
            <div className="pl-3 text-[11px] text-[#6B6258]/80 flex justify-between font-mono">
              <span>
                ({record.total_parcels} parcels @ {phpFmt(ratePerParcel)}/pc)
              </span>
            </div>
          ) : (
            rateBreakdown.map((b) => (
              <div
                key={b.rate}
                className="pl-3 text-[11px] text-[#6B6258]/80 flex justify-between font-mono"
              >
                <span>
                  ({b.parcels} parcels @ {phpFmt(b.rate)}/pc)
                </span>
                <span className="tabular-nums">{phpFmt(b.gross)}</span>
              </div>
            ))
          )}

          {/* Option B: Other Earnings Input */}
          <div className="flex justify-between items-center pt-1 border-t border-[#EFEAE2]/40">
            <span className="text-[#6B6258]">Other Earnings</span>
            {role !== "rider" && record.status !== "paid" ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-[#A39988]">₱</span>
                <input
                  type="number"
                  value={otherEarnings === 0 ? "" : otherEarnings}
                  placeholder="0.00"
                  onChange={(e) => setOtherEarnings(Number(e.target.value))}
                  className="w-16 h-6 px-1.5 text-right font-mono text-[11px] border border-[#EFEAE2] bg-white rounded focus:border-[#db6c00] focus:ring-1 focus:ring-[#db6c00] outline-none transition"
                />
              </div>
            ) : (
              <span className="font-mono tabular-nums text-[#1A1410]">
                {phpFmt(otherEarnings)}
              </span>
            )}
          </div>

          {/* Option B: FM Pick Up Count Input */}
          <div className="flex justify-between items-center">
            <span className="text-[#6B6258]">FM Pick Up</span>
            {role !== "rider" && record.status !== "paid" ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-[#A39988]">Qty</span>
                <input
                  type="number"
                  value={fmPickupCount === 0 ? "" : fmPickupCount}
                  placeholder="0"
                  onChange={(e) => setFmPickupCount(Number(e.target.value))}
                  className="w-16 h-6 px-1.5 text-right font-mono text-[11px] border border-[#EFEAE2] bg-white rounded focus:border-[#db6c00] focus:ring-1 focus:ring-[#db6c00] outline-none transition"
                />
              </div>
            ) : (
              <span className="font-mono tabular-nums text-[#1A1410]">
                {phpFmt(fmPickupCount * 3)}
              </span>
            )}
          </div>
          {fmPickupCount > 0 && (
            <div className="pl-3 text-[10px] text-[#A39988] flex justify-between font-mono">
              <span>({fmPickupCount} pickups @ ₱3.00/pc)</span>
              <span>{phpFmt(fmPickupCount * 3)}</span>
            </div>
          )}

          <div className="flex justify-between pt-1 border-t border-[#EFEAE2] font-semibold text-xs text-[#1A1410]">
            <span>Total Earnings</span>
            <span className="font-mono tabular-nums">{phpFmt(totalEarnings)}</span>
          </div>
        </div>
      </div>

      {/* Deductions Section */}
      <div className="space-y-2 pt-2">
        <div className="text-[10px] uppercase tracking-wider text-[#6B6258] font-bold">
          Deductions
        </div>
        <div className="text-xs space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-[#6B6258]">General Deductions</span>
            {role !== "rider" && record.status !== "paid" ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-[#A39988]">₱</span>
                <input
                  type="number"
                  value={deductions === 0 ? "" : deductions}
                  placeholder="0.00"
                  onChange={(e) => setDeductions(Number(e.target.value))}
                  className="w-16 h-6 px-1.5 text-right font-mono text-[11px] border border-[#EFEAE2] bg-white rounded focus:border-[#db6c00] focus:ring-1 focus:ring-[#db6c00] outline-none transition"
                />
              </div>
            ) : (
              <span className="font-mono tabular-nums text-[#6B6258]">
                {phpFmt(deductions)}
              </span>
            )}
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[#6B6258]">Late Onhold / FM</span>
            {role !== "rider" && record.status !== "paid" ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-[#A39988]">₱</span>
                <input
                  type="number"
                  value={lateOnhold === 0 ? "" : lateOnhold}
                  placeholder="0.00"
                  onChange={(e) => setLateOnhold(Number(e.target.value))}
                  className="w-16 h-6 px-1.5 text-right font-mono text-[11px] border border-[#EFEAE2] bg-white rounded focus:border-[#db6c00] focus:ring-1 focus:ring-[#db6c00] outline-none transition"
                />
              </div>
            ) : (
              <span className="font-mono tabular-nums text-[#6B6258]">
                {phpFmt(lateOnhold)}
              </span>
            )}
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[#6B6258]">Late Remittance</span>
            {role !== "rider" && record.status !== "paid" ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-[#A39988]">₱</span>
                <input
                  type="number"
                  value={lateRemittance === 0 ? "" : lateRemittance}
                  placeholder="0.00"
                  onChange={(e) => setLateRemittance(Number(e.target.value))}
                  className="w-16 h-6 px-1.5 text-right font-mono text-[11px] border border-[#EFEAE2] bg-white rounded focus:border-[#db6c00] focus:ring-1 focus:ring-[#db6c00] outline-none transition"
                />
              </div>
            ) : (
              <span className="font-mono tabular-nums text-[#6B6258]">
                {phpFmt(lateRemittance)}
              </span>
            )}
          </div>

          <div className="flex justify-between pt-1 border-t border-[#EFEAE2] font-semibold text-xs text-[#1A1410]">
            <span>Total Deductions</span>
            <span className="font-mono tabular-nums text-[#6B6258]">
              {phpFmt(totalDeductions)}
            </span>
          </div>
        </div>
      </div>

      {/* Save Adjustments Button */}
      {role !== "rider" && isAdjustmentsChanged && (
        <button
          disabled={isSavingAdjustments}
          onClick={handleSaveAdjustments}
          className="w-full h-8 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50 mt-4"
        >
          {isSavingAdjustments ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" />
          )}
          Save Adjustments
        </button>
      )}

      {/* Total Take-Home */}
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
  );
}
