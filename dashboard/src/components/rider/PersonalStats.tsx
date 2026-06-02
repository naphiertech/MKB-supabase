import {
  CalendarCheck,
  Hourglass,
  ShieldCheck,
  AlertTriangle } from
'lucide-react';
interface StatProps {
  label: string;
  value: string | number;
  sub: string;
  icon: typeof CalendarCheck;
  tone: 'emerald' | 'brand' | 'amber';
  positive?: boolean;
}
const TONE: Record<
  StatProps['tone'],
  {
    iconBg: string;
    iconText: string;
    iconRing: string;
    topBar: string;
  }> =
{
  emerald: {
    iconBg: 'bg-emerald-50',
    iconText: 'text-emerald-600',
    iconRing: 'ring-emerald-500/25',
    topBar: 'bg-emerald-500'
  },
  brand: {
    iconBg: 'bg-[#FFF1E0]',
    iconText: 'text-[#db6c00]',
    iconRing: 'ring-[#db6c00]/25',
    topBar: 'bg-[#db6c00]'
  },
  amber: {
    iconBg: 'bg-amber-50',
    iconText: 'text-amber-600',
    iconRing: 'ring-amber-500/25',
    topBar: 'bg-amber-500'
  }
};
function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  positive
}: StatProps) {
  const t = TONE[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#EFEAE2] bg-white p-5 shadow-sm ar-card-hover">
      <div className={`absolute top-0 left-0 right-0 h-[2px] ${t.topBar}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#6B6258] font-mono font-semibold">
            {label}
          </div>
          <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-[#1A1410]">
            {value}
          </div>
        </div>
        <span
          className={`flex items-center justify-center w-9 h-9 rounded-lg ${t.iconBg} ${t.iconText} ring-1 ${t.iconRing}`}>
          
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <div
        className={`mt-2 text-[11px] ${positive ? 'text-emerald-600' : 'text-[#6B6258]'} font-mono font-medium`}>
        
        {positive && '● '}
        {sub}
      </div>
    </div>);

}
interface PersonalStatsProps {
  daysPresent: number;
  monthDays: number;
  hoursThisWeek: number;
  violationsThisMonth: number;
}
export function PersonalStats({
  daysPresent,
  monthDays,
  hoursThisWeek,
  violationsThisMonth
}: PersonalStatsProps) {
  const noViolations = violationsThisMonth === 0;
  return (
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatTile
        label="Days Present · This Month"
        value={`${daysPresent} / ${monthDays}`}
        sub={`${Math.round(daysPresent / Math.max(monthDays, 1) * 100)}% attendance rate`}
        icon={CalendarCheck}
        tone="emerald" />
      
      <StatTile
        label="Hours · This Week"
        value={hoursThisWeek.toFixed(1)}
        sub="Logged across active shifts"
        icon={Hourglass}
        tone="brand" />
      
      <StatTile
        label="Violations · This Month"
        value={violationsThisMonth}
        sub={
        noViolations ?
        'Clean record — keep it up' :
        'Review with your supervisor'
        }
        icon={noViolations ? ShieldCheck : AlertTriangle}
        tone={noViolations ? 'emerald' : 'amber'}
        positive={noViolations} />
      
    </section>);

}
