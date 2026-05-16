import { useMemo, useState } from 'react';
import {
  FileDown,
  FileSpreadsheet,
  Calculator,
  User as UserIcon,
  Check,
  ChevronsUpDown,
  Lock } from
'lucide-react';
import { riders, zones } from '../services/mockData';
import {
  exportPayslipPDF,
  exportPayslipCSV,
  type PayslipData,
  type PayslipDay } from
'../lib/payrollExport';
import { pushToast } from '../hooks/useToast';
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
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
function buildDaysForRange(
riderIndex: number,
from: string,
to: string)
: PayslipDay[] {
  const start = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  if (end < start) return [];
  const days: PayslipDay[] = [];
  const rand = seeded(
    riderIndex * 100 + Number(from.replace(/-/g, '')) % 9999
  );
  const cursor = new Date(start);
  while (cursor <= end) {
    const date = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
    const r = rand();
    let status: PayslipDay['status'] = 'Present';
    let timeIn: string | null = '08:00';
    let timeOut: string | null = '17:00';
    let hours = 9;
    if (r < 0.08) {
      status = 'Late';
      timeIn = `08:${pad(Math.floor(r * 100) + 12)}`;
      hours = 8.3;
    } else if (r < 0.12) {
      status = 'Absent';
      timeIn = null;
      timeOut = null;
      hours = 0;
    } else if (r < 0.15) {
      status = 'On Leave';
      timeIn = null;
      timeOut = null;
      hours = 0;
    }
    days.push({
      date,
      timeIn,
      timeOut,
      hours,
      status
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}
function phpFmt(n: number) {
  return `₱${n.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
function DayStatusPill({ status }: {status: PayslipDay['status'];}) {
  const map: Record<
    PayslipDay['status'],
    {
      bg: string;
      text: string;
    }> =
  {
    Present: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700'
    },
    Late: {
      bg: 'bg-[#FEF3C7]',
      text: 'text-[#a16207]'
    },
    Absent: {
      bg: 'bg-red-50',
      text: 'text-red-700'
    },
    'On Leave': {
      bg: 'bg-slate-100',
      text: 'text-slate-600'
    }
  };
  const s = map[status];
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${s.bg} ${s.text}`}>
      
      {status}
    </span>);

}
export function PayrollComputation() {
  const [riderId, setRiderId] = useState(riders[0].id);
  const [dailyRate, setDailyRate] = useState(500);
  const [from, setFrom] = useState(isoOffset(14));
  const [to, setTo] = useState(isoToday());
  const [pickerOpen, setPickerOpen] = useState(false);
  const rider = riders.find((r) => r.id === riderId) ?? riders[0];
  const riderIndex = riders.findIndex((r) => r.id === riderId);
  const zone = zones.find((z) => z.id === rider.zoneId)?.name ?? '—';
  const days = useMemo(
    () => buildDaysForRange(riderIndex, from, to),
    [riderIndex, from, to]
  );
  const daysPresent = days.filter(
    (d) => d.status === 'Present' || d.status === 'Late'
  ).length;
  const totalHours = Math.round(days.reduce((s, d) => s + d.hours, 0) * 10) / 10;
  const grossPay = daysPresent * dailyRate;
  const deductions = 0;
  const netPay = grossPay - deductions;
  function buildPayslipData(): PayslipData {
    return {
      riderName: rider.name,
      riderId: rider.riderCode,
      zone,
      cutoffFrom: from,
      cutoffTo: to,
      dailyRate,
      days,
      daysPresent,
      totalHours,
      grossPay,
      deductions,
      netPay
    };
  }
  function handleExportPDF() {
    if (days.length === 0) {
      pushToast({
        title: 'Invalid cutoff range',
        description: 'Please select a valid date range.',
        tone: 'error'
      });
      return;
    }
    try {
      exportPayslipPDF(buildPayslipData());
      pushToast({
        title: 'Payslip downloaded',
        description: `${rider.name} · ${phpFmt(grossPay)}`,
        tone: 'success'
      });
    } catch {
      pushToast({
        title: 'Failed to generate payslip',
        tone: 'error'
      });
    }
  }
  function handleExportCSV() {
    if (days.length === 0) {
      pushToast({
        title: 'Invalid cutoff range',
        description: 'Please select a valid date range.',
        tone: 'error'
      });
      return;
    }
    try {
      exportPayslipCSV(buildPayslipData());
      pushToast({
        title: 'CSV exported',
        description: `${days.length} day${days.length === 1 ? '' : 's'} · ${rider.name}`,
        tone: 'success'
      });
    } catch {
      pushToast({
        title: 'Failed to export CSV',
        tone: 'error'
      });
    }
  }
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      {/* Rider Selector + Computation Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Rider Selector */}
        <div className="bg-white border border-[#EFEAE2] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-[#FEF3C7] ring-1 ring-[#ca8a04]/30 flex items-center justify-center">
              <UserIcon className="w-4 h-4 text-[#a16207]" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[#1A1410]">
                Select Rider
              </div>
              <div className="text-[11px] text-[#6B6258] font-mono">
                {riders.length} active
              </div>
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] hover:border-[#ca8a04]/40 transition text-left">
              
              <img
                src={rider.avatar}
                alt=""
                className="w-9 h-9 rounded-full bg-white border border-[#EFEAE2]" />
              
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#1A1410] truncate">
                  {rider.name}
                </div>
                <div className="text-[11px] font-mono text-[#6B6258] truncate">
                  {rider.riderCode} · {zone}
                </div>
              </div>
              <ChevronsUpDown className="w-4 h-4 text-[#6B6258] shrink-0" />
            </button>

            {pickerOpen &&
            <div className="absolute z-30 mt-1.5 w-full max-h-72 overflow-y-auto bg-white border border-[#EFEAE2] rounded-lg shadow-lg">
                {riders.map((r) => {
                const zName =
                zones.find((z) => z.id === r.zoneId)?.name ?? '—';
                const selected = r.id === riderId;
                return (
                  <button
                    key={r.id}
                    onClick={() => {
                      setRiderId(r.id);
                      setPickerOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#FEF9C3]/60 transition ${selected ? 'bg-[#FEF9C3]/80' : ''}`}>
                    
                      <img
                      src={r.avatar}
                      alt=""
                      className="w-7 h-7 rounded-full bg-[#FAFAF7] border border-[#EFEAE2]" />
                    
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-[#1A1410] truncate">
                          {r.name}
                        </div>
                        <div className="text-[10.5px] font-mono text-[#6B6258] truncate">
                          {r.riderCode} · {zName}
                        </div>
                      </div>
                      {selected && <Check className="w-4 h-4 text-[#ca8a04]" />}
                    </button>);

              })}
              </div>
            }
          </div>

          {/* Inputs */}
          <div className="mt-5 space-y-3.5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
                Daily Rate (₱)
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6258] font-mono">
                  ₱
                </span>
                <input
                  type="number"
                  min={0}
                  value={dailyRate}
                  onChange={(e) =>
                  setDailyRate(Math.max(0, Number(e.target.value) || 0))
                  }
                  className="w-full h-10 pl-7 pr-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] font-mono outline-none focus:border-[#ca8a04] focus:ring-2 focus:ring-[#ca8a04]/15" />
                
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
                  Cutoff From
                </div>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] font-mono outline-none focus:border-[#ca8a04] focus:ring-2 focus:ring-[#ca8a04]/15" />
                
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
                  Cutoff To
                </div>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] font-mono outline-none focus:border-[#ca8a04] focus:ring-2 focus:ring-[#ca8a04]/15" />
                
              </div>
            </div>
          </div>
        </div>

        {/* Computation Panel */}
        <div className="lg:col-span-2 bg-white border border-[#EFEAE2] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFEAE2] flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#FEF3C7] ring-1 ring-[#ca8a04]/30 flex items-center justify-center">
              <Calculator className="w-4 h-4 text-[#a16207]" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-[#1A1410]">
                Salary Computation
              </div>
              <div className="text-[11px] text-[#6B6258] font-mono">
                {from} → {to} · auto-computed
              </div>
            </div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold text-[#a16207] bg-[#FEF3C7] border border-[#ca8a04]/30 uppercase tracking-wider">
              <Lock className="w-3 h-3" /> Read-only
            </span>
          </div>

          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <ComputeCell
              label="Days Present"
              value={String(daysPresent)}
              hint="From validated logs" />
            
            <ComputeCell
              label="Total Hours"
              value={`${totalHours.toFixed(1)}`}
              hint="hours worked" />
            
            <ComputeCell
              label="Gross Pay"
              value={phpFmt(grossPay)}
              hint={`${daysPresent} × ₱${dailyRate.toFixed(2)}`}
              highlight />
            
            <ComputeCell
              label="Deductions"
              value={phpFmt(deductions)}
              hint="Gov't deductions excluded" />
            
          </div>

          <div className="px-5 pb-5">
            <div className="rounded-xl bg-gradient-to-r from-[#FEF9C3] to-[#FEF3C7] border border-[#ca8a04]/30 px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-[#a16207] font-semibold">
                  Net Pay
                </div>
                <div className="text-[10px] text-[#713f12] mt-0.5">
                  Same as Gross — government deductions are processed
                  separately.
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-[#a16207] font-mono tabular-nums">
                {phpFmt(netPay)}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="px-5 pb-5 flex flex-col sm:flex-row gap-2.5">
            <button
              onClick={handleExportPDF}
              className="flex-1 h-11 rounded-lg bg-[#ca8a04] hover:bg-[#a16207] text-white text-sm font-semibold transition inline-flex items-center justify-center gap-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#ca8a04]/30">
              
              <FileDown className="w-4 h-4" />
              Export PDF Payslip
            </button>
            <button
              onClick={handleExportCSV}
              className="flex-1 h-11 rounded-lg bg-white border border-[#EFEAE2] hover:border-[#ca8a04]/40 hover:bg-[#FEF9C3]/40 text-[#1A1410] text-sm font-semibold transition inline-flex items-center justify-center gap-2">
              
              <FileSpreadsheet className="w-4 h-4 text-[#a16207]" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Day-by-day breakdown */}
      <div className="bg-white border border-[#EFEAE2] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EFEAE2] flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[#1A1410]">
              Day-by-day Breakdown
            </div>
            <div className="text-[11px] text-[#6B6258] font-mono mt-0.5">
              {days.length} day{days.length === 1 ? '' : 's'} · {rider.name}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#FAFAF7] border-b border-[#EFEAE2]">
              <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-[#6B6258] font-semibold">
                <th className="px-5 py-3">Date</th>
                <th className="px-3 py-3">Time-In</th>
                <th className="px-3 py-3">Time-Out</th>
                <th className="px-3 py-3 text-right">Hours</th>
                <th className="px-3 py-3 pr-5">Status</th>
              </tr>
            </thead>
            <tbody>
              {days.length === 0 ?
              <tr>
                  <td
                  colSpan={5}
                  className="px-5 py-10 text-center text-sm text-[#6B6258]">
                  
                    No days in selected cutoff range.
                  </td>
                </tr> :

              days.map((d, i) =>
              <tr
                key={d.date}
                className={`border-b last:border-b-0 border-[#EFEAE2] ${i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAF7]/60'}`}>
                
                    <td className="px-5 py-2.5 font-mono text-[#1A1410]">
                      {d.date}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[#1A1410]">
                      {d.timeIn ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[#1A1410]">
                      {d.timeOut ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[#1A1410]">
                      {d.hours.toFixed(1)}
                    </td>
                    <td className="px-3 py-2.5 pr-5">
                      <DayStatusPill status={d.status} />
                    </td>
                  </tr>
              )
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>);

}
function ComputeCell({
  label,
  value,
  hint,
  highlight





}: {label: string;value: string;hint?: string;highlight?: boolean;}) {
  return (
    <div
      className={`rounded-lg p-3.5 border ${highlight ? 'bg-[#FEF9C3]/60 border-[#ca8a04]/30' : 'bg-[#FAFAF7] border-[#EFEAE2]'}`}>
      
      <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold">
        {label}
      </div>
      <div
        className={`mt-1.5 text-lg font-bold font-mono tabular-nums ${highlight ? 'text-[#a16207]' : 'text-[#1A1410]'}`}>
        
        {value}
      </div>
      {hint &&
      <div className="text-[10px] text-[#6B6258] font-mono mt-0.5">
          {hint}
        </div>
      }
    </div>);

}