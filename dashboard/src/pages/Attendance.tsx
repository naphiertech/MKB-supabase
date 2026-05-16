import { useMemo, useState } from 'react';
import { BadgeCheck, Clock, UserMinus, PalmtreeIcon } from 'lucide-react';
import { attendanceLogs, zones } from '../services/mockData';
import { StatCard } from '../components/common/StatCard';
import { AttendanceTable } from '../components/attendance/AttendanceTable';
export function Attendance() {
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [shiftFilter, setShiftFilter] = useState<string>('all');
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).
  toISOString().
  slice(0, 10);
  const [dateFrom, setDateFrom] = useState<string>(sevenDaysAgo);
  const [dateTo, setDateTo] = useState<string>(today);
  const todayLogs = attendanceLogs.filter((l) => l.date === today);
  const kpis = {
    present: todayLogs.filter((l) => l.status === 'present').length,
    late: todayLogs.filter((l) => l.status === 'late').length,
    absent: todayLogs.filter((l) => l.status === 'absent').length,
    onLeave: todayLogs.filter((l) => l.status === 'on_leave').length
  };
  const filtered = useMemo(() => {
    return attendanceLogs.filter(
      (l) =>
      l.date >= dateFrom &&
      l.date <= dateTo && (
      zoneFilter === 'all' || l.zoneId === zoneFilter) && (
      statusFilter === 'all' || l.status === statusFilter) && (
      shiftFilter === 'all' || true)
    );
  }, [dateFrom, dateTo, zoneFilter, statusFilter, shiftFilter]);
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Present Today"
          value={kpis.present}
          icon={BadgeCheck}
          accent="green"
          pulse
          trend={{
            direction: 'up',
            value: '+5 vs avg'
          }} />
        
        <StatCard
          label="Late Today"
          value={kpis.late}
          icon={Clock}
          accent="amber"
          trend={{
            direction: 'down',
            value: '-2 vs yesterday'
          }} />
        
        <StatCard
          label="Absent"
          value={kpis.absent}
          icon={UserMinus}
          accent="red"
          trend={{
            direction: 'flat',
            value: 'no change',
            positive: false
          }} />
        
        <StatCard
          label="On Leave"
          value={kpis.onLeave}
          icon={PalmtreeIcon}
          accent="blue"
          trend={{
            direction: 'flat',
            value: '2 scheduled'
          }} />
        
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#EFEAE2] rounded-xl p-4 flex flex-wrap items-end gap-3 shadow-sm">
        <FilterField label="From">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="att-input" />
          
        </FilterField>
        <FilterField label="To">
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="att-input" />
          
        </FilterField>
        <FilterField label="Zone">
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            className="att-input">
            
            <option value="all">All Zones</option>
            {zones.map((z) =>
            <option key={z.id} value={z.id}>
                {z.name}
              </option>
            )}
          </select>
        </FilterField>
        <FilterField label="Status">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="att-input">
            
            <option value="all">All</option>
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="absent">Absent</option>
            <option value="on_leave">On Leave</option>
          </select>
        </FilterField>
        <FilterField label="Shift">
          <select
            value={shiftFilter}
            onChange={(e) => setShiftFilter(e.target.value)}
            className="att-input">
            
            <option value="all">All</option>
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
            <option value="evening">Evening</option>
          </select>
        </FilterField>
        <div className="flex-1" />
        <div className="text-xs text-[#6B6258] font-mono">
          {filtered.length} records
        </div>

        <style>{`
          .att-input {
            height: 34px;
            padding: 0 10px;
            background: #FAFAF7;
            border: 1px solid #EFEAE2;
            border-radius: 6px;
            color: #1A1410;
            font-size: 12px;
            outline: none;
            font-family: 'Geist Mono', monospace;
            transition: border-color 150ms ease, box-shadow 150ms ease;
          }
          .att-input:focus {
            border-color: #db6c00;
            box-shadow: 0 0 0 3px rgba(219, 108, 0, 0.12);
          }
          select.att-input {
            appearance: none;
            padding-right: 28px;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B6258' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 10px center;
          }
          .att-input::-webkit-calendar-picker-indicator { opacity: 0.7; cursor: pointer; }
        `}</style>
      </div>

      <AttendanceTable logs={filtered} />
    </div>);

}
function FilterField({
  label,
  children



}: {label: string;children: React.ReactNode;}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1 font-mono">
        {label}
      </div>
      {children}
    </div>);

}