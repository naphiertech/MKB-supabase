import { useEffect, useState, useMemo } from 'react';
import { BadgeCheck, Clock, UserMinus, PalmtreeIcon, Printer, X, FileText, Upload, Download } from 'lucide-react';
import { getAttendanceLogs, getLocalDateString } from '../services/attendanceService';
import { getZones } from '../services/geofenceService';
import type { AttendanceLog, Zone } from '../services/types';
import { StatCard } from '../components/common/StatCard';
import { AttendanceTable } from '../components/attendance/AttendanceTable';
import { getRidersLookup } from '../services/riderService';
import { AttendanceDetailsPanel } from '../components/attendance/AttendanceDetailsPanels';
import { parseDTRPdf, saveImportedLogs, ParsedDTRLog } from '../services/dtrParserService';
import { toast } from 'react-hot-toast';
import { exportEmployeeDTR } from '../lib/exports/employeeExport';

export function Attendance() {
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const today = getLocalDateString();
  const sevenDaysAgo = getLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const [dateFrom, setDateFrom] = useState<string>(sevenDaysAgo);
  const [dateTo, setDateTo] = useState<string>(today);

  const [attendanceList, setAttendanceList] = useState<AttendanceLog[]>([]);
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [activeSummaryModal, setActiveSummaryModal] = useState<'present' | 'late' | 'absent' | 'on_leave' | null>(null);
  
  // DTR states
  const [dtrModalOpen, setDtrModalOpen] = useState(false);
  const [dtrRiderId, setDtrRiderId] = useState('');
  const [dtrDateFrom, setDtrDateFrom] = useState<string>(sevenDaysAgo);
  const [ridersList, setRidersList] = useState<{ id: string; name: string; mkb_id?: string; zoneName?: string }[]>([]);

  // DTR Import states
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsingStatus, setParsingStatus] = useState<string>('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedLogs, setParsedLogs] = useState<ParsedDTRLog[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getAttendanceLogs().then(setAttendanceList);
    getZones().then(setZonesList);
    
    // Fetch riders for DTR picker
    getRidersLookup()
      .then((data) => {
        setRidersList(data.map((r: {
          id: string;
          name: string;
          mkb_id?: string;
          zones: { name: string } | { name: string }[] | null;
        }) => {
          const zName = Array.isArray(r.zones) ? r.zones[0]?.name : r.zones?.name;
          return {
            id: r.id,
            name: r.name,
            mkb_id: r.mkb_id,
            zoneName: zName || 'Zamboanga City'
          };
        }));
      })
      .catch((error) => {
        console.error('Error fetching riders:', error);
        toast.error('Failed to load riders list');
      });
  }, []);
  const todayLogs = useMemo(() => {
    return attendanceList.filter((l) => l.date === today);
  }, [attendanceList, today]);

  const kpis = useMemo(() => {
    return {
      present: todayLogs.filter((l) => l.status === 'present').length,
      late: todayLogs.filter((l) => l.status === 'late').length,
      absent: todayLogs.filter((l) => l.status === 'absent').length,
      onLeave: todayLogs.filter((l) => l.status === 'on_leave').length
    };
  }, [todayLogs]);
  const filtered = useMemo(() => {
    return attendanceList.filter(
      (l) =>
      l.date >= dateFrom &&
      l.date <= dateTo && (
      zoneFilter === 'all' || l.zoneId === zoneFilter) && (
      statusFilter === 'all' || l.status === statusFilter)
    );
  }, [attendanceList, dateFrom, dateTo, zoneFilter, statusFilter]);

  const handleDownloadDTR = (riderId: string) => {
    const selectedDtrRider = ridersList.find(r => r.id === riderId);
    if (!selectedDtrRider) return;

    const riderZone = selectedDtrRider.zoneName || 'Zamboanga City';
    const start = new Date(dtrDateFrom);
    const riderLogs = attendanceList.filter(l => l.riderId === riderId);

    exportEmployeeDTR({
      riderName: selectedDtrRider.name,
      riderRole: 'RIDER',
      zoneName: riderZone,
      calendarDate: start,
      logs: riderLogs
    });
  };

  const handleProcessImport = async () => {
    if (!importFile) return;
    setIsParsing(true);
    setParsingStatus('Loading document...');
    try {
      const logs = await parseDTRPdf(importFile, ridersList, setParsingStatus);
      setParsedLogs(logs);
      if (logs.length === 0) {
        toast.error('No attendance records parsed from PDF. Please check file format.');
      } else {
        toast.success(`Successfully parsed ${logs.length} attendance records!`);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(err);
      toast.error(`Import failed: ${errorMsg}`);
    } finally {
      setIsParsing(false);
      setParsingStatus('');
    }
  };

  const handleSaveImported = async () => {
    setIsSaving(true);
    try {
      const { count, error } = await saveImportedLogs(parsedLogs);
      if (error) throw error;
      toast.success(`Successfully saved ${count} records to database!`);
      setImportModalOpen(false);
      setImportFile(null);
      setParsedLogs([]);
      getAttendanceLogs().then(setAttendanceList);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(err);
      toast.error(`Save failed: ${errorMsg}`);
    } finally {
      setIsSaving(false);
    }
  };

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
          onClick={() => setActiveSummaryModal((prev) => (prev === 'present' ? null : 'present'))}
          trend={{
            direction: 'up',
            value: '+5 vs avg'
          }} />
        
        <StatCard
          label="Late Today"
          value={kpis.late}
          icon={Clock}
          accent="amber"
          onClick={() => setActiveSummaryModal((prev) => (prev === 'late' ? null : 'late'))}
          trend={{
            direction: 'down',
            value: '-2 vs yesterday'
          }} />
        
        <StatCard
          label="Absent"
          value={kpis.absent}
          icon={UserMinus}
          accent="red"
          onClick={() => setActiveSummaryModal((prev) => (prev === 'absent' ? null : 'absent'))}
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
          onClick={() => setActiveSummaryModal((prev) => (prev === 'on_leave' ? null : 'on_leave'))}
          trend={{
            direction: 'flat',
            value: '2 scheduled'
          }} />
        
      </div>

      {/* Expanding Inline Details Panel */}
      {activeSummaryModal && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300">
          <AttendanceDetailsPanel
            type={activeSummaryModal}
            onClose={() => setActiveSummaryModal(null)}
            logs={todayLogs}
          />
        </div>
      )}

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
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <div className="text-xs text-[#6B6258] font-mono mr-2">
            {filtered.length} records
          </div>
          <button
            onClick={() => setImportModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 h-[34px] rounded-lg border border-[#EFEAE2] bg-white text-[#1A1410] hover:bg-[#FAFAF7] text-xs font-bold uppercase tracking-wider shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0 duration-150 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-[#db6c00]" />
            <span>Import DTR PDF</span>
          </button>
          <button
            onClick={() => setDtrModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 h-[34px] rounded-lg bg-[#db6c00] hover:bg-[#b85a00] text-white text-xs font-bold uppercase tracking-wider shadow-[0_4px_12px_rgba(219,108,0,0.18)] hover:shadow-[0_6px_16px_rgba(219,108,0,0.3)] transition-all hover:-translate-y-0.5 active:translate-y-0 duration-150 cursor-pointer">
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
        
        // Compute DTR dates for the entire month
        const dtrDays = (() => {
          if (!dtrDateFrom) return [];
          const start = new Date(dtrDateFrom);
          const year = start.getFullYear();
          const month = start.getMonth();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          
          const dates: { dayNum: number; dateString: string; displayDate: string }[] = [];
          for (let day = 1; day <= 31; day++) {
            const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            dates.push({
              dayNum: day,
              dateString,
              displayDate: day <= daysInMonth ? `${day}` : ''
            });
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
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#6B6258] font-mono uppercase">Month:</span>
                    <input
                      type="month"
                      value={dtrDateFrom ? dtrDateFrom.substring(0, 7) : ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          const [year, month] = val.split('-');
                          const firstDay = `${year}-${month}-01`;
                          setDtrDateFrom(firstDay);
                        }
                      }}
                      className="att-input w-36 text-xs"
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
                    /* Hide everything in the body */
                    body * {
                      visibility: hidden;
                    }
                    /* Show only the printable DTR area and its children */
                    #printable-dtr-area,
                    #printable-dtr-area * {
                      visibility: visible;
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
                      background: white !important;
                      color: black !important;
                    }
                  }
                `}</style>
                
                {selectedDtrRider ? (
                  <div className="max-w-md mx-auto bg-white border border-slate-400 p-6 shadow-sm font-serif text-slate-800 text-[10px] space-y-4">
                    {/* CS Form Info & Header */}
                    <div className="flex justify-between items-start text-[8px] text-slate-500 font-sans">
                      <span>Civil Service Form No. 48</span>
                      <span className="font-mono">MKB-LOGISTICS</span>
                    </div>

                    <div className="text-center space-y-1">
                      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">DAILY TIME RECORD</h2>
                      <div className="w-full border-b border-black pt-1" />
                      <p className="text-[9px] uppercase font-bold tracking-normal pt-1 text-slate-800">{selectedDtrRider.name}</p>
                      <p className="text-[7.5px] italic text-slate-500">(Name)</p>
                    </div>

                    <div className="space-y-1.5 font-sans text-[9px]">
                      <div className="flex justify-between border-b border-slate-300 pb-1">
                        <span className="text-slate-500">Position:</span>
                        <span className="font-bold uppercase text-slate-800">RIDER</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-300 pb-1">
                        <span className="text-slate-500">Area of Assignment:</span>
                        <span className="font-bold uppercase text-slate-800">{selectedDtrRider.zoneName || 'Zamboanga City'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-300 pb-1">
                        <span className="text-slate-500">For the Month of:</span>
                        <span className="font-bold text-slate-800">
                          {new Date(dtrDateFrom).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                        </span>
                      </div>
                    </div>

                    {/* DTR Grid Table */}
                    <table className="w-full text-center border-collapse border border-black font-mono text-[8px]">
                      <thead>
                        <tr className="border-b border-black bg-slate-50">
                          <th rowSpan={2} className="border-r border-black p-1 align-middle font-bold text-[8px]">DAY</th>
                          <th colSpan={2} className="border-b border-r border-black p-0.5 font-bold text-[8px]">A.M.</th>
                          <th colSpan={2} className="border-b border-r border-black p-0.5 font-bold text-[8px]">P.M.</th>
                          <th colSpan={2} className="border-b border-r border-black p-0.5 font-bold text-[8px]">OVERTIME</th>
                          <th colSpan={2} className="p-0.5 font-bold text-[8px]">UNDERTIME</th>
                        </tr>
                        <tr className="border-b border-black bg-slate-50 text-[7.5px]">
                          <th className="border-r border-black p-0.5 font-bold">IN</th>
                          <th className="border-r border-black p-0.5 font-bold">OUT</th>
                          <th className="border-r border-black p-0.5 font-bold">IN</th>
                          <th className="border-r border-black p-0.5 font-bold">OUT</th>
                          <th className="border-r border-black p-0.5 font-bold">IN</th>
                          <th className="border-r border-black p-0.5 font-bold">OUT</th>
                          <th className="border-r border-black p-0.5 font-bold">HRS</th>
                          <th className="p-0.5 font-bold">MIN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dtrDays.map(day => {
                          const log = day.displayDate 
                            ? attendanceList.find(l => l.riderId === dtrRiderId && l.date === day.dateString)
                            : null;

                          let amIn = '—';
                          let amOut = '—';
                          let pmIn = '—';
                          let pmOut = '—';
                          let otIn = '—';
                          let otOut = '—';
                          const utHrs = '—';
                          const utMin = '—';

                          if (log) {
                            if (log.status === 'on_leave') {
                              amIn = 'LEAVE';
                              amOut = 'LEAVE';
                              pmIn = 'LEAVE';
                              pmOut = 'LEAVE';
                            } else if (log.status === 'absent') {
                              amIn = 'ABSENT';
                              amOut = 'ABSENT';
                              pmIn = 'ABSENT';
                              pmOut = 'ABSENT';
                            } else {
                              if (log.timeIn) {
                                const hour = parseInt(log.timeIn.split(':')[0], 10);
                                if (hour < 12) {
                                  amIn = log.timeIn;
                                } else {
                                  pmIn = log.timeIn;
                                }
                              }
                              if (log.timeOut) {
                                const hour = parseInt(log.timeOut.split(':')[0], 10);
                                if (hour < 12) {
                                  amOut = log.timeOut;
                                } else {
                                  pmOut = log.timeOut;
                                }
                              }
                              if (log.hours > 8) {
                                otIn = '17:00';
                                otOut = log.timeOut || '—';
                              }
                            }
                          }

                          return (
                            <tr key={day.dateString} className="border-b border-black/30 font-mono text-[8px] h-[18px] leading-tight">
                              <td className="border-r border-black font-sans font-semibold bg-slate-50/50">{day.dayNum}</td>
                              <td className={`border-r border-black ${amIn === 'LEAVE' ? 'text-indigo-600 font-sans font-bold text-[7px]' : amIn === 'ABSENT' ? 'text-red-500 font-sans font-bold text-[7px]' : ''}`}>{amIn}</td>
                              <td className={`border-r border-black ${amOut === 'LEAVE' ? 'text-indigo-600 font-sans font-bold text-[7px]' : amOut === 'ABSENT' ? 'text-red-500 font-sans font-bold text-[7px]' : ''}`}>{amOut}</td>
                              <td className={`border-r border-black ${pmIn === 'LEAVE' ? 'text-indigo-600 font-sans font-bold text-[7px]' : pmIn === 'ABSENT' ? 'text-red-500 font-sans font-bold text-[7px]' : ''}`}>{pmIn}</td>
                              <td className={`border-r border-black ${pmOut === 'LEAVE' ? 'text-indigo-600 font-sans font-bold text-[7px]' : pmOut === 'ABSENT' ? 'text-red-500 font-sans font-bold text-[7px]' : ''}`}>{pmOut}</td>
                              <td className="border-r border-black">{otIn}</td>
                              <td className="border-r border-black">{otOut}</td>
                              <td className="border-r border-black">{utHrs}</td>
                              <td className="p-0.5">{utMin}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Bottom Certification Info */}
                    <div className="pt-4 space-y-4 text-[9px] font-sans">
                      <p className="text-center italic leading-relaxed text-slate-500">
                        "I certify on my honor that the above is a true and correct record of the hours of service rendered, corresponding to the time of arrival and departure."
                      </p>
                      <div className="grid grid-cols-2 gap-6 pt-4">
                        <div className="text-center space-y-1">
                          <div className="border-b border-black h-5 w-3/4 mx-auto" />
                          <span className="text-[7.5px] text-slate-500 uppercase font-bold">Rider Signature</span>
                        </div>
                        <div className="text-center space-y-1">
                          <div className="border-b border-black h-5 w-3/4 mx-auto" />
                          <span className="text-[7.5px] text-slate-500 uppercase font-bold">Verified by Supervisor</span>
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
                  onClick={() => handleDownloadDTR(dtrRiderId)}
                  disabled={!dtrRiderId}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#db6c00] hover:bg-[#c45f00] disabled:opacity-50 rounded-lg shadow-sm transition-colors">
                  <Download className="w-4 h-4" />
                  <span>Download DTR (PDF)</span>
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* DTR Import Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#1A1410]/40 backdrop-blur-sm" onClick={() => { if (!isParsing && !isSaving) setImportModalOpen(false); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-[#EFEAE2] w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden z-10 animate-in fade-in duration-200">
            <div className="p-4 border-b border-[#EFEAE2] bg-[#FAFAF7] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-[#db6c00]" />
                <span className="text-sm font-bold text-[#1A1410]">Import DTR PDF</span>
              </div>
              <button
                disabled={isParsing || isSaving}
                onClick={() => setImportModalOpen(false)}
                className="p-1 rounded-md text-[#6B6258] hover:text-[#1A1410] hover:bg-gray-100 transition disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="border-2 border-dashed border-[#EFEAE2] rounded-xl p-6 flex flex-col items-center justify-center bg-[#FAFAF7] hover:bg-[#FAFAF7]/50 transition">
                <FileText className="w-8 h-8 text-[#db6c00]/60 mb-2" />
                <p className="text-xs font-semibold text-[#1A1410] mb-1">Upload Rider DTR PDF</p>
                <p className="text-[10px] text-[#6B6258] mb-3">Accepts official double-column DTR PDF sheets</p>
                
                <input
                  type="file"
                  accept=".pdf"
                  disabled={isParsing || isSaving}
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="dtr-pdf-upload"
                />
                <label
                  htmlFor="dtr-pdf-upload"
                  className="px-4 py-1.5 rounded-lg border border-[#EFEAE2] bg-white text-[#1A1410] hover:bg-gray-50 text-xs font-semibold shadow-sm cursor-pointer transition disabled:opacity-50"
                >
                  Choose File
                </label>
                {importFile && (
                  <p className="text-xs text-[#db6c00] font-mono mt-3 font-semibold">
                    Selected: {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              {importFile && parsedLogs.length === 0 && (
                <button
                  onClick={handleProcessImport}
                  disabled={isParsing}
                  className="w-full h-9 rounded-lg bg-[#db6c00] hover:bg-[#b85a00] text-white text-xs font-bold uppercase tracking-wider transition disabled:opacity-50"
                >
                  {isParsing ? 'Processing...' : 'Parse DTR PDF'}
                </button>
              )}

              {isParsing && (
                <div className="flex flex-col items-center justify-center py-6 space-y-3">
                  <div className="w-6 h-6 border-2 border-[#db6c00] border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-[#6B6258] font-medium">{parsingStatus}</p>
                </div>
              )}

              {parsedLogs.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-[#EFEAE2] pb-2">
                    <span className="text-xs font-bold text-[#1A1410]">Extracted DTR Logs Preview</span>
                    <span className="text-[10px] text-[#6B6258] font-mono bg-gray-100 px-2 py-0.5 rounded">
                      {parsedLogs.length} logs found
                    </span>
                  </div>
                  
                  <div className="border border-[#EFEAE2] rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-[#FAFAF7] text-[10px] text-[#6B6258] uppercase font-bold tracking-wider sticky top-0 border-b border-[#EFEAE2]">
                        <tr>
                          <th className="p-2 border-r border-[#EFEAE2]">Rider</th>
                          <th className="p-2 border-r border-[#EFEAE2]">Date</th>
                          <th className="p-2 border-r border-[#EFEAE2] text-center">In</th>
                          <th className="p-2 border-r border-[#EFEAE2] text-center">Out</th>
                          <th className="p-2 border-r border-[#EFEAE2] text-center">Hours</th>
                          <th className="p-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFEAE2] text-[11px] font-mono">
                        {parsedLogs.map((log, idx) => (
                          <tr key={idx} className="hover:bg-[#FAFAF7]">
                            <td className="p-2 border-r border-[#EFEAE2] font-sans font-semibold text-[#1A1410]">
                              {log.riderName}
                            </td>
                            <td className="p-2 border-r border-[#EFEAE2]">
                              {log.date}
                            </td>
                            <td className="p-2 border-r border-[#EFEAE2] text-center text-emerald-600">
                              {log.timeIn || '—'}
                            </td>
                            <td className="p-2 border-r border-[#EFEAE2] text-center text-amber-600">
                              {log.timeOut || '—'}
                            </td>
                            <td className="p-2 border-r border-[#EFEAE2] text-center font-bold">
                              {log.hours.toFixed(2)}h
                            </td>
                            <td className="p-2 text-center font-sans font-bold">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase ${
                                log.status === 'present' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                              }`}>
                                {log.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[#EFEAE2] bg-[#FAFAF7] flex justify-end gap-3">
              <button
                disabled={isParsing || isSaving}
                onClick={() => {
                  setImportModalOpen(false);
                  setImportFile(null);
                  setParsedLogs([]);
                }}
                className="px-4 py-2 text-xs font-semibold text-[#6B6258] hover:text-[#1A1410] hover:bg-[#F5F0E8] rounded-lg transition-colors"
              >
                Cancel
              </button>
              {parsedLogs.length > 0 && (
                <button
                  disabled={isSaving}
                  onClick={handleSaveImported}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#db6c00] hover:bg-[#c45f00] rounded-lg shadow-sm transition-colors"
                >
                  {isSaving ? 'Saving...' : 'Confirm Import & Save'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>);

}
function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1 font-mono">
        {label}
      </div>
      {children}
    </div>);

}
