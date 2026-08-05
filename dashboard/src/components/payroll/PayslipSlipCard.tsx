import { Shield, Loader2, CheckCircle2 } from "lucide-react";
import { type PayrollRecordShape } from "./PayrollDetailsModal";
import { isEditableStatus } from "../../types/payroll";
import { BRANDING } from "../../config/branding";
import { type OperationalParcelSummary } from "../../services/parcelService";

interface PayslipSlipCardProps {
  record: PayrollRecordShape;
  role: "admin" | "hr" | "payroll" | "rider";
  grossPay: number;
  operationalSummary: OperationalParcelSummary;
  calculationVersion: number;
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
  operationalSummary,
  calculationVersion,
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
    <div className="border border-border bg-white rounded-xl p-5 shadow-sm space-y-4">
      <div className="text-center space-y-1 pb-4 border-b border-border border-dashed">
        <div className="inline-flex p-1.5 rounded-lg bg-accent ring-1 ring-primary/20 mb-1">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <h4 className="text-xs uppercase tracking-[0.2em] font-extrabold text-foreground">
          MKB Corporation
        </h4>
        <p className="text-[10px] text-muted-foreground font-mono">
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
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
          Earnings
        </div>
        <div className="text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Base Delivery Pay</span>
            <span className="font-mono tabular-nums text-foreground">
              {phpFmt(grossPay)}
            </span>
          </div>
          <div className="pl-3 text-[11px] text-muted-foreground/80 flex justify-between font-mono">
            <span>{operationalSummary.standardDelivered} standard parcels</span>
            <span className="tabular-nums">{phpFmt(operationalSummary.standardEarnings)}</span>
          </div>
          <div className="pl-3 text-[11px] text-muted-foreground/80 flex justify-between font-mono">
            <span>{operationalSummary.heavyDelivered} heavy parcels</span>
            <span className="tabular-nums">{phpFmt(operationalSummary.heavyEarnings)}</span>
          </div>
          <div className="pl-3 text-[10px] text-subtle-text font-mono">
            Calculation v{calculationVersion}
          </div>

          {/* Option B: Other Earnings Input */}
          <div className="flex justify-between items-center pt-1 border-t border-border/40">
            <span className="text-muted-foreground">Other Earnings</span>
            {role === "payroll" && isEditableStatus(record.status) ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-subtle-text">₱</span>
                <input
                  type="number"
                  value={otherEarnings === 0 ? "" : otherEarnings}
                  placeholder="0.00"
                  onChange={(e) => setOtherEarnings(Number(e.target.value))}
                  className="w-16 h-6 px-1.5 text-right font-mono text-[11px] border border-border bg-white rounded focus:border-primary focus:ring-1 focus:ring-primary outline-none transition"
                />
              </div>
            ) : (
              <span className="font-mono tabular-nums text-foreground">
                {phpFmt(otherEarnings)}
              </span>
            )}
          </div>

          {/* Option B: FM Pick Up Count Input */}
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">FM Pick Up</span>
            {role === "payroll" && isEditableStatus(record.status) ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-subtle-text">Qty</span>
                <input
                  type="number"
                  value={fmPickupCount === 0 ? "" : fmPickupCount}
                  placeholder="0"
                  onChange={(e) => setFmPickupCount(Number(e.target.value))}
                  className="w-16 h-6 px-1.5 text-right font-mono text-[11px] border border-border bg-white rounded focus:border-primary focus:ring-1 focus:ring-primary outline-none transition"
                />
              </div>
            ) : (
              <span className="font-mono tabular-nums text-foreground">
                {phpFmt(fmPickupCount * 3)}
              </span>
            )}
          </div>
          {fmPickupCount > 0 && (
            <div className="pl-3 text-[10px] text-subtle-text flex justify-between font-mono">
              <span>({fmPickupCount} pickups @ ₱3.00/pc)</span>
              <span>{phpFmt(fmPickupCount * 3)}</span>
            </div>
          )}

          <div className="flex justify-between pt-1 border-t border-border font-semibold text-xs text-foreground">
            <span>Total Earnings</span>
            <span className="font-mono tabular-nums">{phpFmt(totalEarnings)}</span>
          </div>
        </div>
      </div>

      {/* Deductions Section */}
      <div className="space-y-2 pt-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
          Deductions
        </div>
        <div className="text-xs space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">General Deductions</span>
            {role === "payroll" && isEditableStatus(record.status) ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-subtle-text">₱</span>
                <input
                  type="number"
                  value={deductions === 0 ? "" : deductions}
                  placeholder="0.00"
                  onChange={(e) => setDeductions(Number(e.target.value))}
                  className="w-16 h-6 px-1.5 text-right font-mono text-[11px] border border-border bg-white rounded focus:border-primary focus:ring-1 focus:ring-primary outline-none transition"
                />
              </div>
            ) : (
              <span className="font-mono tabular-nums text-muted-foreground">
                {phpFmt(deductions)}
              </span>
            )}
          </div>

          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Late Onhold / FM</span>
            {role === "payroll" && isEditableStatus(record.status) ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-subtle-text">₱</span>
                <input
                  type="number"
                  value={lateOnhold === 0 ? "" : lateOnhold}
                  placeholder="0.00"
                  onChange={(e) => setLateOnhold(Number(e.target.value))}
                  className="w-16 h-6 px-1.5 text-right font-mono text-[11px] border border-border bg-white rounded focus:border-primary focus:ring-1 focus:ring-primary outline-none transition"
                />
              </div>
            ) : (
              <span className="font-mono tabular-nums text-muted-foreground">
                {phpFmt(lateOnhold)}
              </span>
            )}
          </div>

          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Late Remittance</span>
            {role === "payroll" && isEditableStatus(record.status) ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-subtle-text">₱</span>
                <input
                  type="number"
                  value={lateRemittance === 0 ? "" : lateRemittance}
                  placeholder="0.00"
                  onChange={(e) => setLateRemittance(Number(e.target.value))}
                  className="w-16 h-6 px-1.5 text-right font-mono text-[11px] border border-border bg-white rounded focus:border-primary focus:ring-1 focus:ring-primary outline-none transition"
                />
              </div>
            ) : (
              <span className="font-mono tabular-nums text-muted-foreground">
                {phpFmt(lateRemittance)}
              </span>
            )}
          </div>

          <div className="flex justify-between pt-1 border-t border-border font-semibold text-xs text-foreground">
            <span>Total Deductions</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {phpFmt(totalDeductions)}
            </span>
          </div>
        </div>
      </div>

      {/* Save Adjustments Button */}
      {role === "payroll" && isEditableStatus(record.status) && isAdjustmentsChanged && (
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
      <div className="pt-4 border-t border-dashed border-border flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
            Net Take-Home
          </div>
          <div className="text-[10.5px] text-subtle-text font-mono leading-none mt-0.5">
            Gross Pay less deductions
          </div>
        </div>
        <div className="text-right">
          <span className="text-xl font-bold text-primary font-mono tabular-nums">
            {phpFmt(netSalary)}
          </span>
        </div>
      </div>

      <div className="text-center text-[10px] text-subtle-text italic pt-1">
        Generated dynamically via {BRANDING.appName} System.
      </div>
    </div>
  );
}
