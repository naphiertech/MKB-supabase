import React, { useEffect, useState, useMemo } from 'react';
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
  CartesianGrid
} from 'recharts';
import { useRealtimeLocation } from '../../hooks/useRealtimeLocation';
import { getZones } from '../../services/geofenceService';
import type { Zone } from '../../services/types';

function dateOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

const stableAttendanceRate = Array.from({ length: 30 }, (_, i) => {
  const x = (i * 9301 + 49297) % 233280;
  const rate = 82 + (x % 15) + (i % 3 === 0 ? 2.5 : -1.5);
  return {
    day: dateOffset(29 - i),
    rate: Math.round(rate * 10) / 10
  };
});

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
  const [shouldRender, setShouldRender] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShouldRender(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <ChartCard title="Attendance Rate" subtitle="Last 30 days" tone="primary">
      <div style={{ height: 220 }}>
        {shouldRender ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={stableAttendanceRate}
              margin={{
                top: 8,
                right: 12,
                left: -10,
                bottom: 0
              }}>
              <CartesianGrid
                stroke="#EFEAE2"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="day"
                tick={axisTick}
                tickFormatter={(v) => v.slice(5)}
                interval={4}
                stroke="#EFEAE2"
              />
              <YAxis tick={axisTick} domain={[60, 100]} stroke="#EFEAE2" />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{
                  stroke: '#db6c00',
                  strokeOpacity: 0.3
                }}
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="#db6c00"
                strokeWidth={2.5}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: '#db6c00'
                }}
                isAnimationActive={true}
                animationDuration={1200}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </ChartCard>
  );
}

export function ViolationsByZoneChart() {
  const { violations } = useRealtimeLocation();
  const [zones, setZones] = useState<Zone[]>([]);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    getZones().then(setZones);
    const timer = setTimeout(() => setShouldRender(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const violationsByZone = useMemo(() => {
    return zones.map((z) => ({
      zone: z.name,
      violations: violations.filter((v) => v.zoneName === z.name).length
    }));
  }, [zones, violations]);

  return (
    <ChartCard title="Violations by Zone" subtitle="This month" tone="red">
      <div style={{ height: 220 }}>
        {shouldRender ? (
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
                vertical={false}
              />
              <XAxis
                dataKey="zone"
                tick={{
                  fontSize: 10,
                  fill: '#6B6258'
                }}
                stroke="#EFEAE2"
              />
              <YAxis tick={axisTick} stroke="#EFEAE2" />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{
                  fill: '#FFF1E0'
                }}
              />
              <Bar
                dataKey="violations"
                fill="#DC2626"
                radius={[4, 4, 0, 0]}
                isAnimationActive={true}
                animationDuration={1200}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </ChartCard>
  );
}

export function StatusMixChart() {
  const { riders } = useRealtimeLocation();
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShouldRender(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const activeCount = riders.filter((r) => r.status === 'active').length;
  const idleCount = riders.filter((r) => r.status === 'idle').length;
  const violationCount = riders.filter((r) => r.status === 'violation').length;
  const offlineCount = riders.filter((r) => r.status === 'offline').length;
  const totalRiders = riders.length;
  const isEmpty = totalRiders === 0;

  const statusMix = useMemo(() => {
    return [
      { name: 'Active', value: activeCount, color: '#10B981' },
      { name: 'Idle', value: idleCount, color: '#F59E0B' },
      { name: 'Violation', value: violationCount, color: '#EF4444' },
      { name: 'Offline', value: offlineCount, color: '#6B7280' }
    ];
  }, [activeCount, idleCount, violationCount, offlineCount]);

  const pieData = useMemo(() => {
    if (isEmpty) {
      return [{ name: 'No Riders', value: 1, color: '#EFEAE2' }];
    }
    return statusMix;
  }, [isEmpty, statusMix]);

  return (
    <ChartCard title="Rider Status Mix" subtitle="Current" tone="green">
      <div className="flex items-center gap-4">
        <div style={{ width: '55%', height: 220 }} className="flex items-center justify-center">
          {shouldRender ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={isEmpty ? 0 : 3}
                  stroke="#FFFFFF"
                  strokeWidth={2}
                  isAnimationActive={true}
                  animationDuration={1000}>
                  {pieData.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                {!isEmpty && <Tooltip contentStyle={tooltipStyle} />}
              </PieChart>
            </ResponsiveContainer>
          ) : null}
        </div>
        <div className="flex-1 space-y-1.5">
          {statusMix.map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    background: s.color
                  }}
                />
                <span className="text-[#1A1410] font-medium">{s.name}</span>
              </span>
              <span className="font-mono text-[#6B6258] tabular-nums font-semibold">
                {s.value}
              </span>
            </div>
          ))}
        </div>
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
    </div>
  );
}
