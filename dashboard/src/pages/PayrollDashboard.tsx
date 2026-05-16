import { useMemo, useState, Fragment } from 'react';
import {
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Lock,
  Calendar } from
'lucide-react';
import { StatCard } from '../components/common/StatCard';
import { riders, zones } from '../services/mockData';
type CutoffHalf = 'first' | 'second';
type PayrollStatus = 'Complete' | 'Incomplete' | 'Flagged';
interface DayBreakdown {
  date: string;
  timeIn: string | null;
  timeOut: string | null;
  hours: number;
  status: 'Present' | 'Late' | 'Absent' | 'On Leave';
}
interface PayrollRow {
  riderId: string;
  riderCode: string;
  name: string;
  avatar: string;
  zone: string;
  daysPresent: number;
  totalHours: number;
  dailyRate: number;
  grossPay: number;
  status: PayrollStatus;
  days: DayBreakdown[];
}
const MONTHS = [
'January',
'February',
'March',
'April',
'May',
'June',
'July',
'August',
'September',
'October',
'November',
'December'];

// Deterministic pseudo-random so the table is stable across renders
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
function pad(n: number) {
  return String(n).padStart(2, '0');
}
function buildCutoffData(monthIdx: number, half: CutoffHalf): PayrollRow[] {
  const startDay = half === 'first' ? 1 : 16;
  const endDay =
  half === 'first' ? 15 : new Date(2026, monthIdx + 1, 0).getDate();
  const workingDays = endDay - startDay + 1;
  return riders.map((rider, i) => {
    const rand = seeded(monthIdx * 100 + (half === 'first' ? 0 : 50) + i);
    const zone = zones.find((z) => z.id === rider.zoneId)?.name ?? '—';
    // Deterministic outcome buckets
    const bucket = i % 5; // 0,1,2 complete, 3 incomplete, 4 flagged
    let status: PayrollStatus = 'Complete';
    if (bucket === 3) status = 'Incomplete';
    if (bucket === 4) status = 'Flagged';
    const days: DayBreakdown[] = [];
    let daysPresent = 0;
    let totalHours = 0;
    for (let d = 0; d < workingDays; d++) {
      const dayNum = startDay + d;
      const date = `2026-${pad(monthIdx + 1)}-${pad(dayNum)}`;
      const r = rand();
      let dayStatus: DayBreakdown['status'] = 'Present';
      let timeIn: string | null = '08:00';
      let timeOut: string | null = '17:00';
      let hours = 9;
      if (status === 'Complete') {
        if (r < 0.08) {
          dayStatus = 'Late';
          timeIn = `08:${pad(Math.floor(r * 50) + 10)}`;
          hours = 8.5;
        }
      } else if (status === 'Incomplete') {
        if (r < 0.25) {
          dayStatus = 'Absent';
          timeIn = null;
          timeOut = null;
          hours = 0;
        } else if (r < 0.4) {
          dayStatus = 'Late';
          timeIn = `08:${pad(Math.floor(r * 50) + 15)}`;
          hours = 8;
        }
      } else {
        // Flagged
        if (r < 0.15) {
          dayStatus = 'Absent';
          timeIn = null;
          timeOut = null;
          hours = 0;
        } else if (r < 0.55) {
          // Flagged: missing time-out
          dayStatus = 'Present';
          timeOut = null;
          hours = 0;
        } else if (r < 0.75) {
          dayStatus = 'Late';
          timeIn = `08:${pad(Math.floor(r * 60) + 20)}`;
          hours = 7.5;
        }
      }
      if (timeIn && timeOut) {
        daysPresent += 1;
        totalHours += hours;
      } else if (timeIn && !timeOut && status !== 'Flagged') {
        daysPresent += 1;
        totalHours += 4;
      }
      days.push({
        date,
        timeIn,
        timeOut,
        hours,
        status: dayStatus
      });
    }
    const dailyRate = 500;
    const grossPay = daysPresent * dailyRate;
    return {
      riderId: rider.id,
      riderCode: rider.riderCode,
      name: rider.name,
      avatar: rider.avatar,
      zone,
      daysPresent,
      totalHours: Math.round(totalHours * 10) / 10,
      dailyRate,
      grossPay,
      status,
      days
    };
  });
}
function phpFmt(n: number) {
  return `₱${n.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
function StatusPill({ status }: {status: PayrollStatus;}) {
  const map: Record<
    PayrollStatus,
    {
      bg: string;
      text: string;
      border: string;
      dot: string;
    }> =
  {
    Complete: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-500/30',
      dot: 'bg-emerald-500'
    },
    Incomplete: {
      bg: 'bg-[#FEF3C7]',
      text: 'text-[#a16207]',
      border: 'border-[#ca8a04]/40',
      dot: 'bg-[#ca8a04]'
    },
    Flagged: {
      bg: 'bg-orange-50',
      text: 'text-orange-700',
      border: 'border-orange-500/40',
      dot: 'bg-orange-500'
    }
  };
  const s = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${s.bg} ${s.text} ${s.border}`}>
      
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>);

}
function DayStatusPill({ status }: {status: DayBreakdown['status'];}) {
  const map: Record<
    DayBreakdown['status'],
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
export function PayrollDashboard() {
  // Today is May 2026 per spec defaults
  const [month, setMonth] = useState(4); // May (0-indexed)
  const [half, setHalf] = useState<CutoffHalf>('first');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rows = useMemo(() => buildCutoffData(month, half), [month, half]);
  const totals = useMemo(() => {
    const totalGross = rows.reduce((s, r) => s + r.grossPay, 0);
    const totalHours = rows.reduce((s, r) => s + r.totalHours, 0);
    const ridersPaid = rows.filter((r) => r.status !== 'Flagged').length;
    const complete = rows.filter((r) => r.status === 'Complete').length;
    const flagged = rows.filter(
      (r) => r.status === 'Flagged' || r.status === 'Incomplete'
    ).length;
    return {
      totalGross,
      totalHours: Math.round(totalHours * 10) / 10,
      ridersPaid,
      complete,
      flagged
    };
  }, [rows]);
  function toggleRow(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);else
      next.add(id);
      return next;
    });
  }
  const cutoffLabel =
  half === 'first' ?
  `${MONTHS[month]} 1–15` :
  `${MONTHS[month]} 16–${new Date(2026, month + 1, 0).getDate()}`;
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      {/* Read-only banner */}
      <div className="flex items-start gap-2.5 px-4 py-2.5 rounded-lg bg-[#FEF9C3] border border-[#ca8a04]/30">
        <Lock className="w-4 h-4 text-[#a16207] mt-0.5 shrink-0" />
        <div className="text-[12.5px] text-[#713f12] leading-relaxed">
          <span className="font-semibold">Read-only view.</span> Payroll can
          view validated attendance hours and compute salaries — attendance
          records cannot be edited from this dashboard.
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Riders This Cutoff"
          value={rows.length}
          sub={`Active payroll · ${cutoffLabel}`}
          icon={Users}
          accent="amber"
          spark={[12, 14, 16, 18, 19, 20, 20]} />
        
        <StatCard
          label="Total Hours Logged"
          value={
          <>
              <span className="text-[#1A1410]">{totals.totalHours}</span>
              <span className="text-[#A39988] text-xl"> hrs</span>
            </>
          }
          sub="Validated by HR"
          icon={Clock}
          accent="amber"
          trend={{
            direction: 'up',
            value: '+58 vs last cutoff'
          }}
          spark={[600, 680, 720, 780, 810, 830, totals.totalHours]} />
        
        <StatCard
          label="Complete Hours"
          value={totals.complete}
          sub="Ready for payout"
          icon={CheckCircle2}
          accent="green"
          trend={{
            direction: 'up',
            value: `${Math.round(totals.complete / rows.length * 100)}% of fleet`
          }}
          spark={[8, 10, 11, 12, 13, 14, totals.complete]} />
        
        <StatCard
          label="Incomplete / Flagged"
          value={totals.flagged}
          sub={totals.flagged > 0 ? 'Needs HR review' : 'All clear'}
          icon={AlertTriangle}
          accent="red"
          trend={{
            direction: totals.flagged > 3 ? 'up' : 'flat',
            value: 'awaiting validation',
            positive: false
          }}
          spark={[2, 3, 4, 5, 4, 5, totals.flagged]} />
        
      </div>

      {/* Cutoff selector */}
      <div className="bg-white border border-[#EFEAE2] rounded-xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#FEF3C7] ring-1 ring-[#ca8a04]/30 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-[#a16207]" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold">
                Cutoff Period
              </div>
              <div className="text-sm font-semibold text-[#1A1410]">
                {cutoffLabel}, 2026
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="h-9 px-3 pr-8 rounded-md bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] outline-none focus:border-[#ca8a04] focus:ring-2 focus:ring-[#ca8a04]/15 font-mono cursor-pointer">
              
              {MONTHS.map((m, idx) =>
              <option key={m} value={idx}>
                  {m} 2026
                </option>
              )}
            </select>

            <div className="inline-flex rounded-md border border-[#EFEAE2] bg-[#FAFAF7] p-0.5">
              <button
                onClick={() => setHalf('first')}
                className={`h-8 px-3 rounded text-xs font-semibold transition ${half === 'first' ? 'bg-[#ca8a04] text-white shadow-sm' : 'text-[#6B6258] hover:text-[#1A1410]'}`}>
                
                {MONTHS[month].slice(0, 3)} 1–15
              </button>
              <button
                onClick={() => setHalf('second')}
                className={`h-8 px-3 rounded text-xs font-semibold transition ${half === 'second' ? 'bg-[#ca8a04] text-white shadow-sm' : 'text-[#6B6258] hover:text-[#1A1410]'}`}>
                
                {MONTHS[month].slice(0, 3)} 16–
                {new Date(2026, month + 1, 0).getDate()}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Hours Table */}
      <div className="bg-white border border-[#EFEAE2] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EFEAE2] flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[#1A1410]">
              Attendance Hours
            </div>
            <div className="text-[11px] text-[#6B6258] font-mono mt-0.5">
              {rows.length} riders · {cutoffLabel} · click a row to expand
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#FEF3C7] border border-[#ca8a04]/30 text-[10px] uppercase tracking-wider font-semibold text-[#a16207]">
            <Lock className="w-3 h-3" />
            Read-only
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#FAFAF7] border-b border-[#EFEAE2]">
              <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-[#6B6258] font-semibold">
                <th className="px-5 py-3 w-8"></th>
                <th className="px-3 py-3">Rider</th>
                <th className="px-3 py-3">Zone</th>
                <th className="px-3 py-3 text-right">Days</th>
                <th className="px-3 py-3 text-right">Hours</th>
                <th className="px-3 py-3 text-right">Daily Rate</th>
                <th className="px-3 py-3 text-right">Gross Pay</th>
                <th className="px-3 py-3 pr-5">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isExpanded = expanded.has(r.riderId);
                const isFlagged =
                r.status === 'Flagged' || r.status === 'Incomplete';
                return (
                  <Fragment key={r.riderId}>
                    <tr
                      onClick={() => toggleRow(r.riderId)}
                      className={`border-b border-[#EFEAE2] cursor-pointer transition hover:bg-[#FEF9C3]/40 ${isFlagged ? 'relative' : ''}`}>
                      
                      <td className="px-5 py-3 relative">
                        {isFlagged &&
                        <span
                          className={`absolute left-0 top-0 bottom-0 w-[3px] ${r.status === 'Flagged' ? 'bg-orange-500' : 'bg-[#ca8a04]'}`} />

                        }
                        {isExpanded ?
                        <ChevronDown className="w-4 h-4 text-[#6B6258]" /> :

                        <ChevronRight className="w-4 h-4 text-[#6B6258]" />
                        }
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={r.avatar}
                            alt=""
                            className="w-7 h-7 rounded-full bg-[#FAFAF7] border border-[#EFEAE2]" />
                          
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-[#1A1410] truncate">
                              {r.name}
                            </div>
                            <div className="text-[10.5px] font-mono text-[#6B6258]">
                              {r.riderCode}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[#1A1410]">{r.zone}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-[#1A1410]">
                        {r.daysPresent}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-[#1A1410]">
                        {r.totalHours.toFixed(1)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-[#6B6258]">
                        ₱{r.dailyRate.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold text-[#1A1410]">
                        {phpFmt(r.grossPay)}
                      </td>
                      <td className="px-3 py-3 pr-5">
                        <StatusPill status={r.status} />
                      </td>
                    </tr>
                    {isExpanded &&
                    <tr className="border-b border-[#EFEAE2] bg-[#FEF9C3]/30">
                        <td colSpan={8} className="px-5 py-4">
                          <div className="text-[11px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold mb-2.5">
                            Day-by-day breakdown
                          </div>
                          <div className="overflow-x-auto rounded-lg border border-[#EFEAE2] bg-white">
                            <table className="w-full text-[13px]">
                              <thead className="bg-[#FAFAF7] border-b border-[#EFEAE2]">
                                <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-[#6B6258] font-semibold">
                                  <th className="px-3 py-2">Date</th>
                                  <th className="px-3 py-2">Time-In</th>
                                  <th className="px-3 py-2">Time-Out</th>
                                  <th className="px-3 py-2 text-right">
                                    Hours
                                  </th>
                                  <th className="px-3 py-2">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.days.map((d) =>
                              <tr
                                key={d.date}
                                className="border-b last:border-b-0 border-[#EFEAE2]">
                                
                                    <td className="px-3 py-1.5 font-mono text-[#1A1410]">
                                      {d.date}
                                    </td>
                                    <td className="px-3 py-1.5 font-mono text-[#1A1410]">
                                      {d.timeIn ?? '—'}
                                    </td>
                                    <td className="px-3 py-1.5 font-mono text-[#1A1410]">
                                      {d.timeOut ?? '—'}
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[#1A1410]">
                                      {d.hours.toFixed(1)}
                                    </td>
                                    <td className="px-3 py-1.5">
                                      <DayStatusPill status={d.status} />
                                    </td>
                                  </tr>
                              )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    }
                  </Fragment>);

              })}
            </tbody>
          </table>
        </div>

        {/* Summary bar */}
        <div className="px-5 py-4 border-t border-[#EFEAE2] bg-[#FEF9C3]/40 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold">
              Total Gross Payroll
            </div>
            <div className="text-xl font-bold text-[#a16207] font-mono tabular-nums">
              {phpFmt(totals.totalGross)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold">
              Total Hours
            </div>
            <div className="text-xl font-bold text-[#1A1410] font-mono tabular-nums">
              {totals.totalHours}{' '}
              <span className="text-sm text-[#6B6258] font-normal">hrs</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold">
              Riders Paid
            </div>
            <div className="text-xl font-bold text-[#1A1410] font-mono tabular-nums">
              {totals.ridersPaid}{' '}
              <span className="text-sm text-[#6B6258] font-normal">
                / {rows.length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>);

}