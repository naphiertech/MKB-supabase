import { useEffect, useState, useMemo } from 'react';
import { BadgeCheck, Clock, UserMinus, PalmtreeIcon, Printer, X } from 'lucide-react';
import { getAttendanceLogs, getLocalDateString } from '../services/attendanceService';
import { getZones } from '../services/geofenceService';
import type { AttendanceLog, Zone } from '../services/types';
import { StatCard } from '../components/common/StatCard';
import { AttendanceTable } from '../components/attendance/AttendanceTable';
import { supabase } from '../lib/supabaseClient';

export function Attendance() {
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [shiftFilter, setShiftFilter] = useState<string>('all');
  const today = getLocalDateString();
  const sevenDaysAgo = getLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const [dateFrom, setDateFrom] = useState<string>(sevenDaysAgo);
  const [dateTo, setDateTo] = useState<string>(today);

  const [attendanceList, setAttendanceList] = useState<AttendanceLog[]>([]);
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  
  // DTR states
  const [dtrModalOpen, setDtrModalOpen] = useState(false);
  const [dtrRiderId, setDtrRiderId] = useState('');
  const [dtrDateFrom, setDtrDateFrom] = useState<string>(sevenDaysAgo);
  const [dtrDateTo, setDtrDateTo] = useState<string>(today);
  const [ridersList, setRidersList] = useState<{ id: string; name: string; mkb_id?: string }[]>([]);

  useEffect(() => {
    getAttendanceLogs().then(setAttendanceList);
    getZones().then(setZonesList);
    
    // Fetch riders for DTR picker
    supabase
      .from('riders')
      .select('id, name, mkb_id')
      .order('name')
      .then(({ data }) => {
        if (data) {
          setRidersList(data.map((r: any) => ({ id: r.id, name: r.name, mkb_id: r.mkb_id })));
        }
      });
  }, []);
  const todayLogs = attendanceList.filter((l) => l.date === today);
  const kpis = {
    present: todayLogs.filter((l) => l.status === 'present').length,
    late: todayLogs.filter((l) => l.status === 'late').length,
    absent: todayLogs.filter((l) => l.status === 'absent').length,
    onLeave: todayLogs.filter((l) => l.status === 'on_leave').length
  };
  const filtered = useMemo(() => {
    return attendanceList.filter(
      (l) =>
      l.date >= dateFrom &&
      l.date <= dateTo && (
      zoneFilter === 'all' || l.zoneId === zoneFilter) && (
      statusFilter === 'all' || l.status === statusFilter) && (
      shiftFilter === 'all' || true)
    );
  }, [attendanceList, dateFrom, dateTo, zoneFilter, statusFilter, shiftFilter]);
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
             {zonesList.map((z) =>
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
        <div className="flex items-center gap-3">
          <div className="text-xs text-[#6B6258] font-mono">
            {filtered.length} records
          </div>
          <button
            onClick={() => setDtrModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 h-8.5 rounded-lg bg-[#db6c00] hover:bg-[#b85a00] text-white text-xs font-semibold shadow-sm transition hover:scale-102 active:scale-98">
            <Printer className="w-3.5 h-3.5" />
            <span>Generate DTR</span>
          </button>
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

      {/* DTR Print Preview Modal */}
      {dtrModalOpen && (() => {
        const selectedDtrRider = ridersList.find(r => r.id === dtrRiderId);
        
        // Compute DTR dates
        const dtrDays = (() => {
          if (!dtrDateFrom || !dtrDateTo) return [];
          const dates: { dateString: string; displayDate: string }[] = [];
          const start = new Date(dtrDateFrom);
          const end = new Date(dtrDateTo);
          const current = new Date(start);
          while (current <= end) {
            const dateString = current.toISOString().split('T')[0];
            const displayDate = current.toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' });
            dates.push({ dateString, displayDate });
            current.setDate(current.getDate() + 1);
          }
          return dates;
        })();

        return (
          <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-[#1A1410]/40 backdrop-blur-sm" onClick={() => setDtrModalOpen(false)} />
            
            {/* Modal Container */}
            <div className="relative bg-white rounded-2xl shadow-2xl border border-[#EFEAE2] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden z-10 animate-in fade-in duration-200">
              
              {/* Settings Header (Non-printable) */}
              <div className="p-4 border-b border-[#EFEAE2] bg-[#FAFAF7] flex flex-wrap items-center justify-between gap-3 print:hidden">
                <div className="flex items-center gap-2">
                  <Printer className="w-4 h-4 text-[#db6c00]" />
                  <span className="text-sm font-semibold text-[#1A1410]">Configure DTR Print</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#6B6258] font-mono uppercase">Rider:</span>
                    <select
                      value={dtrRiderId}
                      onChange={(e) => setDtrRiderId(e.target.value)}
                      className="att-input w-44">
                      <option value="">Select Rider...</option>
                      {ridersList.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-[#6B6258] font-mono uppercase">Dates:</span>
                    <input
                      type="date"
                      value={dtrDateFrom}
                      onChange={(e) => setDtrDateFrom(e.target.value)}
                      className="att-input w-28 text-[11px]"
                    />
                    <span className="text-[#6B6258]">-</span>
                    <input
                      type="date"
                      value={dtrDateTo}
                      onChange={(e) => setDtrDateTo(e.target.value)}
                      className="att-input w-28 text-[11px]"
                    />
                  </div>
                </div>
                <button
                  onClick={() => setDtrModalOpen(false)}
                  className="p-1 rounded-md text-[#6B6258] hover:text-[#1A1410] hover:bg-white transition"
                  aria-label="Close DTR modal">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* DTR Print Area */}
              <div className="flex-1 overflow-y-auto p-8 bg-white ar-scroll" id="printable-dtr-area">
                <style>{`
                  @media print {
                    body {
                      background: white !important;
                      color: black !important;
                    }
                    .print\\:hidden {
                      display: none !important;
                    }
                    #printable-dtr-area {
                      position: absolute;
                      left: 0;
                      top: 0;
                      width: 100%;
                      padding: 0;
                      margin: 0;
                      box-shadow: none;
                      border: none;
                    }
                  }
                `}</style>
                
                {selectedDtrRider ? (
                  <div className="space-y-6 max-w-lg mx-auto font-sans text-slate-900">
                    <div className="text-center space-y-1">
                      <h2 className="text-lg font-bold uppercase tracking-wider text-slate-800">Daily Time Record</h2>
                      <p className="text-[10px] text-slate-500 tracking-widest uppercase">MKB Corporation</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs border-b border-t border-slate-900 py-3">
                      <div>
                        <span className="text-slate-500">Employee:</span>
                        <p className="font-bold text-sm uppercase">{selectedDtrRider.name}</p>
                        <p className="font-mono text-[10px] text-slate-500">{selectedDtrRider.mkb_id || 'RIDER-CODE'}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500">For Period:</span>
                        <p className="font-bold text-xs">
                          {new Date(dtrDateFrom).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        <p className="text-[10px] text-slate-400">to</p>
                        <p className="font-bold text-xs">
                          {new Date(dtrDateTo).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                    </div>

                    <table className="w-full text-xs text-left border-collapse border border-slate-900">
                      <thead>
                        <tr className="bg-slate-50 uppercase tracking-wider text-[9px] border-b border-slate-900">
                          <th className="border-r border-slate-900 p-2 font-semibold">Date</th>
                          <th className="border-r border-slate-900 p-2 font-semibold text-center">Arrival</th>
                          <th className="border-r border-slate-900 p-2 font-semibold text-center">Departure</th>
                          <th className="border-r border-slate-900 p-2 font-semibold text-center">Hours</th>
                          <th className="border-r border-slate-900 p-2 font-semibold text-center">Status</th>
                          <th className="p-2 font-semibold text-center">Signature</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dtrDays.map(day => {
                          const log = attendanceList.find(l => l.riderId === dtrRiderId && l.date === day.dateString);
                          return (
                            <tr key={day.dateString} className="border-b border-slate-900/40 font-mono text-[11px]">
                              <td className="border-r border-slate-900 p-1.5 tabular-nums">
                                {day.displayDate}
                              </td>
                              <td className="border-r border-slate-900 p-1.5 tabular-nums text-center">
                                {log?.timeIn || (log?.status === 'on_leave' ? 'LEAVE' : '—')}
                              </td>
                              <td className="border-r border-slate-900 p-1.5 tabular-nums text-center">
                                {log?.timeOut || (log?.status === 'on_leave' ? 'LEAVE' : '—')}
                              </td>
                              <td className="border-r border-slate-900 p-1.5 tabular-nums font-semibold text-center">
                                {log ? `${log.hours.toFixed(1)}h` : '0.0h'}
                              </td>
                              <td className="border-r border-slate-900 p-1.5 uppercase text-[9px] text-center font-sans">
                                {log?.status || 'absent'}
                              </td>
                              <td className="p-1.5"></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div className="pt-8 space-y-4 text-xs">
                      <p className="text-center italic leading-relaxed text-slate-500">
                        "I certify on my honor that the above is a true and correct record of the hours of service rendered, corresponding to the time of arrival and departure."
                      </p>
                      <div className="grid grid-cols-2 gap-8 pt-8">
                        <div className="text-center space-y-1">
                          <div className="border-b border-slate-900 h-6 w-3/4 mx-auto" />
                          <span className="text-[9px] text-slate-500 uppercase">Employee Signature</span>
                        </div>
                        <div className="text-center space-y-1">
                          <div className="border-b border-slate-900 h-6 w-3/4 mx-auto" />
                          <span className="text-[9px] text-slate-500 uppercase">Verified by Supervisor</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Printer className="w-10 h-10 text-slate-400 mb-3" />
                    <p className="text-sm text-slate-500 font-medium">Please select a rider from the settings above to generate DTR preview.</p>
                  </div>
                )}
              </div>

              {/* Footer Controls (Non-printable) */}
              <div className="p-4 border-t border-[#EFEAE2] bg-[#FAFAF7] flex justify-end gap-3 print:hidden">
                <button
                  onClick={() => setDtrModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-[#6B6258] hover:text-[#1A1410] hover:bg-[#F5F0E8] rounded-lg transition-colors">
                  Close
                </button>
                <button
                  onClick={() => window.print()}
                  disabled={!dtrRiderId}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#db6c00] hover:bg-[#c45f00] disabled:opacity-50 rounded-lg shadow-sm transition-colors">
                  <Printer className="w-4 h-4" />
                  <span>Print DTR</span>
                </button>
              </div>

            </div>
          </div>
        );
      })()}
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
