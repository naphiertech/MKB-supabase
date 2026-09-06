import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Award, CalendarX, Clock, ShieldCheck } from 'lucide-react';
import type { ReportsAnalytics } from '../../lib/reportsAnalytics';

const tooltipStyle = {
  backgroundColor: '#FFFFFF', border: '1px solid #EFEAE2', borderRadius: '10px',
  fontSize: '12px', color: '#1A1410', boxShadow: '0 10px 25px -5px rgba(26, 20, 16, 0.12)',
  padding: '10px 14px',
};
const axisTick = { fontSize: 11, fill: '#6B6258', fontFamily: 'Geist Mono, monospace' };

function useChartReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 50);
    return () => window.clearTimeout(timer);
  }, []);
  return ready;
}

export function AttendanceRateChart({ data }: { data: ReportsAnalytics['attendanceTrend'] }) {
  const ready = useChartReady();
  const chartData = useMemo(() => data.map(row => {
    const total = row.present + row.late + row.absent + row.onLeave + (row.dayOff || 0);
    const attended = row.present + row.late;
    return { date: row.date.slice(5), present: attended, total, rate: total ? Math.round(attended / total * 1000) / 10 : 0 };
  }), [data]);
  return (
    <ChartCard title="Attendance Rate Trend" subtitle="Daily rate across matching attendance records" tone="primary">
      <div className="h-[240px] w-full">
        <p className="sr-only">{chartData.map(item => `${item.date}: ${item.rate}% attendance, ${item.present} of ${item.total} attended`).join('; ')}</p>
        {chartData.length === 0 ? <Empty icon={CalendarX} title="No Attendance Records" detail="No attendance records match the selected period and scope." /> : ready ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -15, bottom: 0 }}>
              <defs><linearGradient id="rateGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#db6c00" stopOpacity={0.25} /><stop offset="95%" stopColor="#db6c00" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="#EFEAE2" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={axisTick} stroke="#EFEAE2" />
              <YAxis tick={axisTick} domain={[0, 100]} stroke="#EFEAE2" unit="%" />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value}%`, 'Attendance Rate']} labelFormatter={label => `Date: ${label}`} />
              <Area type="monotone" dataKey="rate" stroke="#db6c00" strokeWidth={2.5} fillOpacity={1} fill="url(#rateGradient)" activeDot={{ r: 5, fill: '#db6c00', stroke: '#fff', strokeWidth: 2 }} animationDuration={700} />
            </AreaChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </ChartCard>
  );
}

export function ViolationsByZoneChart({ data }: { data: ReportsAnalytics['violationByZone'] }) {
  const ready = useChartReady();
  const chartData = data.map(row => ({ zone: row.zoneName, violations: row.violations }));
  return (
    <ChartCard title="Violations by Historical Zone" subtitle="Authoritative recorded violation events" tone="red">
      <div className="h-[240px] w-full">
        <p className="sr-only">{chartData.map(item => `${item.zone}: ${item.violations} violations`).join('; ')}</p>
        {chartData.length === 0 ? <Empty icon={ShieldCheck} title="No Recorded Violations" detail="No violation events match the selected period and scope." success /> : ready ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 10, right: 12, left: -15, bottom: 0 }}>
              <CartesianGrid stroke="#EFEAE2" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="zone" tick={axisTick} stroke="#EFEAE2" interval={0} />
              <YAxis tick={axisTick} stroke="#EFEAE2" allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value} event${value === 1 ? '' : 's'}`, 'Violations']} cursor={{ fill: '#FFF1E0' }} />
              <Bar dataKey="violations" fill="#EF4444" radius={[6, 6, 0, 0]} animationDuration={700} />
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </ChartCard>
  );
}

export function AttendanceDistributionChart({ data }: { data: ReportsAnalytics['attendanceBreakdown'] }) {
  const ready = useChartReady();
  const distribution = [
    { name: 'Present', value: data.present, color: '#10B981' },
    { name: 'Late', value: data.late, color: '#F59E0B' },
    { name: 'Absent', value: data.absent, color: '#EF4444' },
    { name: 'On Leave', value: data.onLeave, color: '#3B82F6' },
    { name: 'Day Off', value: data.dayOff || 0, color: '#94A3B8' },
  ].map(item => ({ ...item, pct: data.total ? Math.round(item.value / data.total * 100) : 0 }));
  const pieData = data.total ? distribution : [{ name: 'No Data', value: 1, color: '#EFEAE2', pct: 0 }];
  return (
    <ChartCard title="Attendance Status Breakdown" subtitle="Distribution across matching records" tone="green">
      <div className="flex min-h-[300px] flex-col items-center justify-between gap-4 sm:h-[240px] sm:min-h-0 sm:flex-row">
        <p className="sr-only">{distribution.map(item => `${item.name}: ${item.value} records, ${item.pct}%`).join('; ')}</p>
        <div className="relative flex h-[200px] w-full items-center justify-center sm:w-[55%]">
          {ready ? <ResponsiveContainer width="100%" height={200}><PieChart><Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={data.total ? 3 : 0} stroke="#FFFFFF" strokeWidth={2} animationDuration={700}>{pieData.map(entry => <Cell key={entry.name} fill={entry.color} />)}</Pie>{data.total > 0 && <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [`${value} record${value === 1 ? '' : 's'}`, name]} />}</PieChart></ResponsiveContainer> : null}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="font-mono text-xl font-bold text-foreground">{data.total}</span><span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Records</span></div>
        </div>
        <div className="w-full space-y-2 sm:w-[45%]">{distribution.map(item => <div key={item.name} className="flex items-center justify-between rounded-lg p-1.5 text-xs hover:bg-panel-bg"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /><span className="font-medium text-foreground">{item.name}</span></span><div className="flex items-center gap-2 font-mono"><span className="font-bold text-muted-foreground">{item.value}</span><span className="rounded border border-border bg-panel-bg px-1.5 py-0.5 text-[11px] text-muted-foreground">{item.pct}%</span></div></div>)}</div>
      </div>
    </ChartCard>
  );
}

export function ZoneCoverageChart({ data }: { data: ReportsAnalytics['zoneCoverage'] }) {
  const ready = useChartReady();
  const chartData = data.filter(row => row.ridersReporting > 0).map(row => ({ zone: row.zoneName, hours: row.averageHours }));
  return (
    <ChartCard title="Zone Coverage (Average Completed Shift)" subtitle="Zone resolved from Rider Assignment history for each attendance date" tone="primary">
      <div className="h-[240px] w-full">
        <p className="sr-only">{chartData.map(item => `${item.zone}: ${item.hours} average completed hours`).join('; ')}</p>
        {chartData.length === 0 ? <Empty icon={Clock} title="No Completed Shifts" detail="No completed shifts match the selected period and scope." /> : ready ? (
          <ResponsiveContainer width="100%" height={240}><BarChart data={chartData} margin={{ top: 10, right: 12, left: -15, bottom: 0 }}><CartesianGrid stroke="#EFEAE2" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="zone" tick={axisTick} stroke="#EFEAE2" /><YAxis tick={axisTick} stroke="#EFEAE2" unit="h" /><Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value} hrs`, 'Average Completed Shift']} cursor={{ fill: '#FFF1E0' }} /><Bar dataKey="hours" fill="#db6c00" radius={[6, 6, 0, 0]} animationDuration={700} /></BarChart></ResponsiveContainer>
        ) : null}
      </div>
    </ChartCard>
  );
}

export function RiderPerformanceChart({ data }: { data: ReportsAnalytics['riderPerformance'] }) {
  const ready = useChartReady();
  const chartData = data.slice(0, 6).map(row => ({ rider: row.riderName, hours: row.totalHours }));
  return (
    <ChartCard title="Rider Performance (Total Hours)" subtitle="Riders with matching attendance records" tone="green">
      <div className="h-[240px] w-full">
        <p className="sr-only">{chartData.map(item => `${item.rider}: ${item.hours} logged hours`).join('; ')}</p>
        {chartData.length === 0 ? <Empty icon={Award} title="No Rider Records" detail="No Rider attendance records match the selected period and scope." /> : ready ? (
          <ResponsiveContainer width="100%" height={240}><BarChart layout="vertical" data={chartData} margin={{ top: 10, right: 20, left: 20, bottom: 0 }}><CartesianGrid stroke="#EFEAE2" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tick={axisTick} stroke="#EFEAE2" unit="h" /><YAxis type="category" dataKey="rider" tick={{ fontSize: 10, fill: '#1A1410' }} stroke="#EFEAE2" width={100} /><Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value} hrs`, 'Logged Shift Hours']} cursor={{ fill: '#FFF1E0' }} /><Bar dataKey="hours" fill="#10B981" radius={[0, 6, 6, 0]} animationDuration={700} /></BarChart></ResponsiveContainer>
        ) : null}
      </div>
    </ChartCard>
  );
}

function Empty({ icon: Icon, title, detail, success = false }: { icon: typeof Clock; title: string; detail: string; success?: boolean }) {
  return <div className="flex h-full flex-col items-center justify-center rounded-lg border border-border bg-panel-bg p-4 text-center"><Icon className={`mb-2 h-8 w-8 ${success ? 'text-emerald-500' : 'text-muted-foreground opacity-60'}`} /><div className="text-xs font-semibold text-foreground">{title}</div><div className="text-[11px] text-muted-foreground">{detail}</div></div>;
}

function ChartCard({ title, subtitle, tone, children }: { title: string; subtitle: string; tone: 'primary' | 'red' | 'green'; children: ReactNode }) {
  const dot = tone === 'primary' ? 'bg-primary' : tone === 'red' ? 'bg-red-500' : 'bg-emerald-500';
  return <div className="flex h-full flex-col justify-between rounded-xl border border-border bg-white p-4 shadow-sm"><div className="mb-2 flex items-start justify-between"><div><div className="flex items-center gap-2 text-sm font-semibold text-foreground"><span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{title}</div><div className="font-mono text-[11px] text-muted-foreground">{subtitle}</div></div></div><div className="flex flex-1 flex-col justify-center">{children}</div></div>;
}
