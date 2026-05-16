import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid } from
'recharts';
import {
  dailyAttendanceRate,
  violationsByZone,
  statusMix } from
'../../services/mockData';
const tooltipStyle = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #EFEAE2',
  borderRadius: 8,
  fontSize: 12,
  color: '#1A1410',
  boxShadow: '0 12px 32px -12px rgba(26, 20, 16, 0.18)'
};
const axisTick = {
  fontSize: 10,
  fill: '#6B6258',
  fontFamily: 'Geist Mono'
};
export function AttendanceRateChart() {
  return (
    <ChartCard title="Attendance Rate" subtitle="Last 30 days" tone="primary">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart
          data={dailyAttendanceRate}
          margin={{
            top: 8,
            right: 12,
            left: -10,
            bottom: 0
          }}>
          
          <CartesianGrid
            stroke="#EFEAE2"
            strokeDasharray="3 3"
            vertical={false} />
          
          <XAxis
            dataKey="day"
            tick={axisTick}
            tickFormatter={(v) => v.slice(5)}
            interval={4}
            stroke="#EFEAE2" />
          
          <YAxis tick={axisTick} domain={[60, 100]} stroke="#EFEAE2" />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{
              stroke: '#db6c00',
              strokeOpacity: 0.3
            }} />
          
          <Line
            type="monotone"
            dataKey="rate"
            stroke="#db6c00"
            strokeWidth={2.5}
            dot={false}
            activeDot={{
              r: 4,
              fill: '#db6c00'
            }} />
          
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>);

}
export function ViolationsByZoneChart() {
  return (
    <ChartCard title="Violations by Zone" subtitle="This month" tone="red">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={violationsByZone}
          margin={{
            top: 8,
            right: 12,
            left: -10,
            bottom: 0
          }}>
          
          <CartesianGrid
            stroke="#EFEAE2"
            strokeDasharray="3 3"
            vertical={false} />
          
          <XAxis
            dataKey="zone"
            tick={{
              fontSize: 10,
              fill: '#6B6258'
            }}
            stroke="#EFEAE2" />
          
          <YAxis tick={axisTick} stroke="#EFEAE2" />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{
              fill: '#FFF1E0'
            }} />
          
          <Bar dataKey="violations" fill="#DC2626" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>);

}
export function StatusMixChart() {
  return (
    <ChartCard title="Rider Status Mix" subtitle="Current" tone="green">
      <div className="flex items-center gap-4">
        <ResponsiveContainer width="55%" height={220}>
          <PieChart>
            <Pie
              data={statusMix}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={3}
              stroke="#FFFFFF"
              strokeWidth={2}>
              
              {statusMix.map((s) =>
              <Cell key={s.name} fill={s.color} />
              )}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-1.5">
          {statusMix.map((s) =>
          <div
            key={s.name}
            className="flex items-center justify-between text-xs">
            
              <span className="flex items-center gap-2">
                <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: s.color
                }} />
              
                <span className="text-[#1A1410]">{s.name}</span>
              </span>
              <span className="font-mono text-[#6B6258] tabular-nums">
                {s.value}
              </span>
            </div>
          )}
        </div>
      </div>
    </ChartCard>);

}
function ChartCard({
  title,
  subtitle,
  tone,
  children





}: {title: string;subtitle: string;tone: 'primary' | 'red' | 'green';children: React.ReactNode;}) {
  const dot =
  tone === 'primary' ?
  'bg-[#db6c00]' :
  tone === 'red' ?
  'bg-red-500' :
  'bg-emerald-500';
  return (
    <div className="bg-white border border-[#EFEAE2] rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-[#1A1410] flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
            {title}
          </div>
          <div className="text-[11px] text-[#6B6258] font-mono">{subtitle}</div>
        </div>
      </div>
      {children}
    </div>);

}