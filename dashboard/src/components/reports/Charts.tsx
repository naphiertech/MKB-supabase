import { useEffect, useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area
} from 'recharts';
import { ShieldCheck, CalendarX, Clock, Award } from 'lucide-react';
import type { AttendanceLog, Zone } from '../../services/types';

const tooltipStyle = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #EFEAE2',
  borderRadius: '10px',
  fontSize: '12px',
  color: '#1A1410',
  boxShadow: '0 10px 25px -5px rgba(26, 20, 16, 0.12)',
  padding: '10px 14px'
};

const axisTick = {
  fontSize: 11,
  fill: '#6B6258',
  fontFamily: 'Geist Mono, monospace'
};

// 1. Attendance Rate Trend Chart
export function AttendanceRateChart({ logs = [] }: { logs?: AttendanceLog[] }) {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShouldRender(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const chartData = useMemo(() => {
    if (!logs || logs.length === 0) return [];

    const dateMap = new Map<string, { present: number; total: number }>();
    logs.forEach((l) => {
      const entry = dateMap.get(l.date) || { present: 0, total: 0 };
      entry.total += 1;
      if (l.status === 'present' || l.status === 'late') {
        entry.present += 1;
      }
      dateMap.set(l.date, entry);
    });

    const sortedDates = Array.from(dateMap.keys()).sort();
    return sortedDates.map((date) => {
      const item = dateMap.get(date)!;
      const rate = item.total > 0 ? Math.round((item.present / item.total) * 1000) / 10 : 0;
      return {
        date: date.slice(5),
        rate,
        present: item.present,
        total: item.total
      };
    });
  }, [logs]);

  return (
    <ChartCard title="Attendance Rate Trend" subtitle="Daily shift arrival & compliance rate (%)" tone="primary">
      <div className="h-[240px] w-full">
        {chartData.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 bg-panel-bg rounded-lg border border-border">
            <CalendarX className="w-8 h-8 text-muted-foreground mb-2 opacity-60" />
            <div className="text-xs font-semibold text-foreground">No Attendance Logs Available</div>
            <div className="text-[11px] text-muted-foreground">No attendance records found in Supabase for the selected date range.</div>
          </div>
        ) : shouldRender ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="rateGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#db6c00" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#db6c00" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#EFEAE2" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={axisTick} stroke="#EFEAE2" />
              <YAxis tick={axisTick} domain={[0, 100]} stroke="#EFEAE2" unit="%" />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number) => [`${value}%`, 'Attendance Rate']}
                labelFormatter={(label) => `Date: ${label}`}
              />
              <Area
                type="monotone"
                dataKey="rate"
                stroke="#db6c00"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#rateGradient)"
                activeDot={{ r: 5, fill: '#db6c00', stroke: '#fff', strokeWidth: 2 }}
                isAnimationActive={true}
                animationDuration={1000}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </ChartCard>
  );
}

// 2. Violations By Zone Chart (Sorted highest to lowest)
export function ViolationsByZoneChart({
  zones = [],
  logs = []
}: {
  zones?: Zone[];
  logs?: AttendanceLog[];
}) {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShouldRender(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const chartData = useMemo(() => {
    if (!zones || zones.length === 0) return [];

    const map = new Map<string, number>();
    zones.forEach((z) => map.set(z.name, 0));

    logs.forEach((l) => {
      if (l.notes?.toLowerCase().includes('violation') || l.notes?.toLowerCase().includes('boundary') || l.status === 'absent') {
        const count = map.get(l.zoneName) || 0;
        map.set(l.zoneName, count + 1);
      }
    });

    const list = Array.from(map.entries()).map(([zone, violations]) => ({ zone, violations }));
    return list.sort((a, b) => b.violations - a.violations);
  }, [zones, logs]);

  const totalViolations = useMemo(() => chartData.reduce((acc, d) => acc + d.violations, 0), [chartData]);

  return (
    <ChartCard title="Violations & Boundary Breaches by Zone" subtitle="Sorted from highest to lowest" tone="red">
      <div className="h-[240px] w-full">
        {totalViolations === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 bg-panel-bg rounded-lg border border-border">
            <ShieldCheck className="w-8 h-8 text-emerald-500 mb-2" />
            <div className="text-xs font-semibold text-foreground">Zero Geofence Violations</div>
            <div className="text-[11px] text-muted-foreground">All active riders operated strictly within assigned boundaries.</div>
          </div>
        ) : shouldRender ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 10, right: 12, left: -15, bottom: 0 }}>
              <CartesianGrid stroke="#EFEAE2" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="zone" tick={axisTick} stroke="#EFEAE2" interval={0} />
              <YAxis tick={axisTick} stroke="#EFEAE2" allowDecimals={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(val: number) => [`${val} event${val === 1 ? '' : 's'}`, 'Violations']}
                cursor={{ fill: '#FFF1E0' }}
              />
              <Bar
                dataKey="violations"
                fill="#EF4444"
                radius={[6, 6, 0, 0]}
                isAnimationActive={true}
                animationDuration={1000}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </ChartCard>
  );
}

// 3. Attendance Status Distribution Chart (Meaningful 24/7)
export function AttendanceDistributionChart({ logs = [] }: { logs?: AttendanceLog[] }) {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShouldRender(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const { distribution, total } = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    let onLeave = 0;

    logs.forEach((l) => {
      if (l.status === 'present') present++;
      else if (l.status === 'late') late++;
      else if (l.status === 'absent') absent++;
      else if (l.status === 'on_leave') onLeave++;
    });

    const tot = present + late + absent + onLeave;
    return {
      total: tot,
      distribution: [
        { name: 'Present', value: present, color: '#10B981', pct: tot ? Math.round((present / tot) * 100) : 0 },
        { name: 'Late', value: late, color: '#F59E0B', pct: tot ? Math.round((late / tot) * 100) : 0 },
        { name: 'Absent', value: absent, color: '#EF4444', pct: tot ? Math.round((absent / tot) * 100) : 0 },
        { name: 'On Leave', value: onLeave, color: '#3B82F6', pct: tot ? Math.round((onLeave / tot) * 100) : 0 }
      ]
    };
  }, [logs]);

  const isEmpty = total === 0;
  const pieData = useMemo(() => {
    if (isEmpty) return [{ name: 'No Data', value: 1, color: '#EFEAE2', pct: 0 }];
    return distribution;
  }, [isEmpty, distribution]);

  return (
    <ChartCard title="Attendance Status Breakdown" subtitle="Distribution across selected records" tone="green">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 h-[240px]">
        <div className="w-full sm:w-[55%] h-[200px] flex items-center justify-center relative">
          {shouldRender ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={isEmpty ? 0 : 3}
                  stroke="#FFFFFF"
                  strokeWidth={2}
                  isAnimationActive={true}
                  animationDuration={1000}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                {!isEmpty && (
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(val: number, name: string) => [`${val} record${val === 1 ? '' : 's'}`, name]}
                  />
                )}
              </PieChart>
            </ResponsiveContainer>
          ) : null}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xl font-bold font-mono text-foreground">{total}</span>
            <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Records</span>
          </div>
        </div>

        <div className="w-full sm:w-[45%] space-y-2">
          {distribution.map((item) => (
            <div key={item.name} className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-panel-bg">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-foreground font-medium">{item.name}</span>
              </span>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-muted-foreground font-bold">{item.value}</span>
                <span className="text-[11px] text-muted-foreground bg-panel-bg px-1.5 py-0.5 rounded border border-border">
                  {item.pct}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}

// 4. Zone Coverage Chart (Rider shift hours per zone, sorted)
export function ZoneCoverageChart({ logs = [] }: { logs?: AttendanceLog[] }) {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShouldRender(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const chartData = useMemo(() => {
    if (!logs || logs.length === 0) return [];

    const map = new Map<string, number>();
    logs.forEach((l) => {
      const current = map.get(l.zoneName) || 0;
      map.set(l.zoneName, current + (l.hours || 0));
    });

    return Array.from(map.entries())
      .map(([zone, hours]) => ({ zone, hours: Math.round(hours * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours);
  }, [logs]);

  return (
    <ChartCard title="Zone Coverage (Total Shift Hours)" subtitle="Accumulated rider-hours by zone" tone="primary">
      <div className="h-[240px] w-full">
        {chartData.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 bg-panel-bg rounded-lg border border-border">
            <Clock className="w-8 h-8 text-muted-foreground mb-2 opacity-60" />
            <div className="text-xs font-semibold text-foreground">No Shift Hours Logged</div>
            <div className="text-[11px] text-muted-foreground">No active shift hours recorded in Supabase for this range.</div>
          </div>
        ) : shouldRender ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 10, right: 12, left: -15, bottom: 0 }}>
              <CartesianGrid stroke="#EFEAE2" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="zone" tick={axisTick} stroke="#EFEAE2" />
              <YAxis tick={axisTick} stroke="#EFEAE2" unit="h" />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(val: number) => [`${val} hrs`, 'Total Shift Hours']}
                cursor={{ fill: '#FFF1E0' }}
              />
              <Bar dataKey="hours" fill="#db6c00" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={1000} />
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </ChartCard>
  );
}

// 5. Rider Performance Ranking Chart
export function RiderPerformanceChart({ logs = [] }: { logs?: AttendanceLog[] }) {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShouldRender(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const chartData = useMemo(() => {
    if (!logs || logs.length === 0) return [];

    const map = new Map<string, { hours: number; shifts: number }>();
    logs.forEach((l) => {
      const cur = map.get(l.riderName) || { hours: 0, shifts: 0 };
      map.set(l.riderName, {
        hours: cur.hours + (l.hours || 0),
        shifts: cur.shifts + 1
      });
    });

    return Array.from(map.entries())
      .map(([rider, data]) => ({ rider, hours: Math.round(data.hours * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 6);
  }, [logs]);

  return (
    <ChartCard title="Top Rider Performance (Total Hours)" subtitle="Highest logged hours for period" tone="green">
      <div className="h-[240px] w-full">
        {chartData.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 bg-panel-bg rounded-lg border border-border">
            <Award className="w-8 h-8 text-muted-foreground mb-2 opacity-60" />
            <div className="text-xs font-semibold text-foreground">No Rider Data Available</div>
            <div className="text-[11px] text-muted-foreground">No rider performance logs available in Supabase for this range.</div>
          </div>
        ) : shouldRender ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart layout="vertical" data={chartData} margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
              <CartesianGrid stroke="#EFEAE2" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={axisTick} stroke="#EFEAE2" unit="h" />
              <YAxis type="category" dataKey="rider" tick={{ fontSize: 10, fill: '#1A1410' }} stroke="#EFEAE2" width={100} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(val: number) => [`${val} hrs`, 'Logged Shift Hours']}
                cursor={{ fill: '#FFF1E0' }}
              />
              <Bar dataKey="hours" fill="#10B981" radius={[0, 6, 6, 0]} isAnimationActive animationDuration={1000} />
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </ChartCard>
  );
}

function ChartCard({
  title,
  subtitle,
  tone,
  children
}: {
  title: string;
  subtitle: string;
  tone: 'primary' | 'red' | 'green';
  children: React.ReactNode;
}) {
  const dot = tone === 'primary' ? 'bg-primary' : tone === 'red' ? 'bg-red-500' : 'bg-emerald-500';
  return (
    <div className="bg-white border border-border rounded-xl p-4 shadow-sm h-full flex flex-col justify-between">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
            {title}
          </div>
          <div className="text-[11px] text-muted-foreground font-mono">{subtitle}</div>
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-center">{children}</div>
    </div>
  );
}
