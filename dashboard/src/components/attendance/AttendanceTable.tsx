import { useMemo, useState, Fragment } from 'react';
import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  FileText,
  Download,
  ScanFace,
  LogIn,
  LogOut,
  Pause } from
'lucide-react';
import type { AttendanceLog } from '../../services/mockData';
import { StatusPill } from './StatusPill';
interface AttendanceTableProps {
  logs: AttendanceLog[];
}
type SortKey = 'date' | 'riderName' | 'zoneName' | 'hours' | 'status';
export function AttendanceTable({ logs }: AttendanceTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const sorted = useMemo(() => {
    const arr = [...logs];
    arr.sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
    return arr;
  }, [logs, sortKey, sortAsc]);
  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);else
    {
      setSortKey(key);
      setSortAsc(true);
    }
  }
  return (
    <div className="bg-white border border-[#EFEAE2] rounded-xl flex flex-col shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-[#EFEAE2] gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-[#1A1410]">
            Attendance Records
          </div>
          <div className="text-[11px] text-[#6B6258] font-mono">
            {sorted.length} entries
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-white border border-[#EFEAE2] text-xs text-[#1A1410] hover:border-[#db6c00]/30 hover:text-[#db6c00] transition">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-white border border-[#EFEAE2] text-xs text-[#1A1410] hover:border-[#db6c00]/30 hover:text-[#db6c00] transition">
            <FileText className="w-3.5 h-3.5" /> PDF
          </button>
        </div>
      </div>

      <div className="overflow-x-auto ar-scroll">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-[#6B6258] border-b border-[#EFEAE2] bg-[#FAFAF7]">
              <th className="font-semibold py-3 px-4 w-8" />
              {(
              [
              ['Rider', 'riderName'],
              ['Date', 'date'],
              ['Time-In', null],
              ['Time-Out', null],
              ['Hours', 'hours'],
              ['Zone', 'zoneName'],
              ['Status', 'status'],
              ['Source', null]] as
              [string, SortKey | null][]).
              map(([label, key]) =>
              <th key={label} className="font-semibold py-3 px-4">
                  {key ?
                <button
                  onClick={() => toggleSort(key)}
                  className="inline-flex items-center gap-1 hover:text-[#db6c00] transition">
                  
                      {label} <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </button> :

                label
                }
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((l, idx) => {
              const isOpen = expanded === l.id;
              return (
                <Fragment key={l.id}>
                  <tr
                    className={`border-b border-[#EFEAE2]/70 hover:bg-[#FFF1E0]/40 ${idx % 2 === 1 ? 'bg-[#FAFAF7]/40' : ''}`}>
                    
                    <td className="py-2.5 px-4">
                      <button
                        onClick={() => setExpanded(isOpen ? null : l.id)}
                        className="text-[#6B6258] hover:text-[#db6c00] transition">
                        
                        {isOpen ?
                        <ChevronDown className="w-4 h-4" /> :

                        <ChevronRight className="w-4 h-4" />
                        }
                      </button>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={l.riderAvatar}
                          alt=""
                          className="w-7 h-7 rounded-full bg-white border border-[#EFEAE2]" />
                        
                        <span className="text-[#1A1410] text-sm font-semibold">
                          {l.riderName}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[#1A1410] tabular-nums">
                      {l.date}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[#1A1410] tabular-nums">
                      {l.timeIn ?? '—'}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[#6B6258] tabular-nums">
                      {l.timeOut ?? '—'}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[#1A1410] tabular-nums font-semibold">
                      {l.hours.toFixed(1)}h
                    </td>
                    <td className="py-2.5 px-4 text-[#1A1410]">{l.zoneName}</td>
                    <td className="py-2.5 px-4">
                      <StatusPill status={l.status} />
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold ${l.source === 'face-scan' ? 'text-[#db6c00]' : 'text-[#6B6258]'}`}>
                        
                        {l.source === 'face-scan' ?
                        <ScanFace className="w-3 h-3" /> :
                        null}
                        {l.source === 'face-scan' ? 'Face Scan' : 'Manual'}
                      </span>
                    </td>
                  </tr>
                  {isOpen &&
                  <tr className="bg-[#FAFAF7]">
                      <td
                      colSpan={9}
                      className="px-4 py-4 border-b border-[#EFEAE2]">
                      
                        <div className="flex flex-col lg:flex-row gap-5">
                          <div className="flex items-start gap-3">
                            <div className="w-20 h-20 rounded-lg bg-white border border-[#EFEAE2] overflow-hidden flex items-center justify-center">
                              {l.faceScanUrl ?
                            <img
                              src={l.faceScanUrl}
                              alt="Face scan"
                              className="w-full h-full object-cover" /> :


                            <ScanFace className="w-8 h-8 text-[#6B6258]" />
                            }
                            </div>
                            <div className="text-xs text-[#6B6258] space-y-1">
                              <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold">
                                Verification
                              </div>
                              <div className="text-[#1A1410] font-semibold">
                                {l.source === 'face-scan' ?
                              'Face-scan match · 98.2%' :
                              'Manual override'}
                              </div>
                              <div className="font-mono text-[#6B6258]">
                                {l.id}
                              </div>
                            </div>
                          </div>

                          <div className="flex-1">
                            <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-2 font-semibold">
                              Geofence timeline
                            </div>
                            <div className="relative pl-3 border-l-2 border-[#EFEAE2] space-y-2">
                              {l.events.length === 0 &&
                            <div className="text-xs text-[#6B6258]">
                                  No geofence events.
                                </div>
                            }
                              {l.events.map((e, i) => {
                              const Icon =
                              e.type === 'enter' ?
                              LogIn :
                              e.type === 'exit' ?
                              LogOut :
                              Pause;
                              const color =
                              e.type === 'enter' ?
                              'text-emerald-600' :
                              e.type === 'exit' ?
                              'text-red-600' :
                              'text-amber-600';
                              const borderColor =
                              e.type === 'enter' ?
                              'border-emerald-500' :
                              e.type === 'exit' ?
                              'border-red-500' :
                              'border-amber-500';
                              const bgColor =
                              e.type === 'enter' ?
                              'bg-emerald-500' :
                              e.type === 'exit' ?
                              'bg-red-500' :
                              'bg-amber-500';
                              return (
                                <div
                                  key={i}
                                  className="flex items-center gap-2 text-xs">
                                  
                                    <span
                                    className={`-ml-[18px] w-3 h-3 rounded-full bg-white border-2 ${borderColor} flex items-center justify-center`}>
                                    
                                      <span
                                      className={`w-1 h-1 rounded-full ${bgColor}`} />
                                    
                                    </span>
                                    <Icon className={`w-3.5 h-3.5 ${color}`} />
                                    <span className="font-mono text-[#1A1410] tabular-nums">
                                      {e.ts}
                                    </span>
                                    <span className="text-[#6B6258]">
                                      {e.type === 'enter' ?
                                    'Entered' :
                                    e.type === 'exit' ?
                                    'Exited' :
                                    'Idle'}{' '}
                                      {e.zone}
                                    </span>
                                  </div>);

                            })}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                </Fragment>);

            })}
            {sorted.length === 0 &&
            <tr>
                <td
                colSpan={9}
                className="text-center py-10 text-sm text-[#6B6258]">
                
                  No records match filters.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>);

}