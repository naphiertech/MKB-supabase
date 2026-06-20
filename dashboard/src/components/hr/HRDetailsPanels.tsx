import { useState } from 'react';
import type { AttendanceLog, Rider } from '../../services/types';
import { 
  Search, 
  Clock, 
  UserX, 
  AlertCircle,
  Phone,
  X,
  AlertTriangle
} from 'lucide-react';

interface HRDetailsPanelProps {
  type: 'on_duty' | 'complete' | 'absent' | 'pending';
  onClose: () => void;
  logs: AttendanceLog[];
  riders: Rider[];
}

export function HRDetailsPanel({
  type,
  onClose,
  logs,
  riders
}: HRDetailsPanelProps) {

  // Theme configuration for the 4 panels
  const themes = {
    on_duty: {
      border: 'border-[#db6c00]/30',
      bg: 'bg-[#FFF1E0]/5',
      badge: 'bg-[#FFF1E0] text-[#db6c00] border-[#db6c00]/20',
      title: 'Riders On Duty Today'
    },
    complete: {
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-50/5',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      title: 'Complete Attendance Today'
    },
    absent: {
      border: 'border-red-500/30',
      bg: 'bg-red-50/5',
      badge: 'bg-red-50 text-red-700 border-red-200',
      title: 'Absent / No Time-In Today'
    },
    pending: {
      border: 'border-amber-500/30',
      bg: 'bg-amber-50/5',
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      title: 'Pending Validation Today'
    }
  };

  const currentTheme = themes[type];

  return (
    <div className={`border-2 ${currentTheme.border} rounded-xl bg-white p-5 shadow-sm space-y-4 transition-all duration-300 relative`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#EFEAE2] pb-3">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider border ${currentTheme.badge}`}>
            {type.replace('_', ' ')}
          </span>
          <h3 className="text-sm font-semibold text-[#1A1410]">{currentTheme.title}</h3>
        </div>
        <button 
          onClick={onClose} 
          className="text-[#6B6258] hover:text-[#1A1410] p-1.5 rounded-lg hover:bg-[#FAFAF7] transition-all"
          aria-label="Close Details Panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Render sub-panels */}
      {type === 'on_duty' && (
        <OnDutyHRDetail logs={logs.filter(l => !!l.timeIn)} riders={riders} />
      )}
      {type === 'complete' && (
        <CompleteHRDetail logs={logs.filter(l => !!l.timeIn && !!l.timeOut)} />
      )}
      {type === 'absent' && (
        <AbsentHRDetail logs={logs.filter(l => l.status === 'absent' || !l.timeIn)} riders={riders} />
      )}
      {type === 'pending' && (
        <PendingValidationHRDetail logs={logs.filter(
          l => (l.source === 'manual' && l.status !== 'absent') || 
               (!!l.timeIn && !l.timeOut && l.status !== 'on_leave')
        )} />
      )}
    </div>
  );
}

/* ==========================================================================
   1. Riders On Duty Sub-component
   ========================================================================== */
function OnDutyHRDetail({ logs, riders }: { logs: AttendanceLog[]; riders: Rider[] }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = logs.filter(l => 
    l.riderName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    l.zoneName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRiderCode = (riderId: string) => {
    return riders.find(r => r.id === riderId)?.riderCode || 'RIDER';
  };

  return (
    <div className="space-y-3">
      {/* Search Row */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#6B6258]" />
        <input
          type="text"
          placeholder="Search riders on duty..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAFAF7] border border-[#EFEAE2] rounded-lg outline-none focus:border-[#db6c00]/50 focus:bg-white text-[#1A1410] transition-colors"
        />
      </div>

      {/* List */}
      <div className="max-h-[300px] overflow-y-auto pr-1 border border-[#EFEAE2] rounded-xl bg-white custom-scrollbar">
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#6B6258]">
            No riders clocked in on duty.
          </div>
        ) : (
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-[#FAFAF7] border-b border-[#EFEAE2] text-[10px] uppercase tracking-wider font-semibold text-[#6B6258]">
                <th className="px-4 py-2.5">Rider</th>
                <th className="px-4 py-2.5">Zone</th>
                <th className="px-4 py-2.5">Time In</th>
                <th className="px-4 py-2.5 text-right">Method</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE2]">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-[#FFF1E0]/20 transition-all">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {log.riderAvatar ? (
                        <img src={log.riderAvatar} alt="" className="w-8 h-8 rounded-full object-cover border border-[#EFEAE2]" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#FFF1E0] flex items-center justify-center font-bold text-[#db6c00] text-xs">
                          {log.riderName.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-[#1A1410]">{log.riderName}</div>
                        <div className="text-[9px] text-[#6B6258] font-mono">{getRiderCode(log.riderId)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#6B6258] font-medium">{log.zoneName}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-[#1A1410]">{log.timeIn || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {log.source === 'face-scan' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                        Face Scan
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                        Manual Entry
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   2. Complete Attendance Sub-component
   ========================================================================== */
function CompleteHRDetail({ logs }: { logs: AttendanceLog[] }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = logs.filter(l => 
    l.riderName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    l.zoneName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#6B6258]" />
        <input
          type="text"
          placeholder="Search complete records..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAFAF7] border border-[#EFEAE2] rounded-lg outline-none focus:border-[#db6c00]/50 focus:bg-white text-[#1A1410] transition-colors"
        />
      </div>

      {/* List */}
      <div className="max-h-[300px] overflow-y-auto pr-1 border border-[#EFEAE2] rounded-xl bg-white custom-scrollbar">
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#6B6258]">
            No complete attendance entries found.
          </div>
        ) : (
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-[#FAFAF7] border-b border-[#EFEAE2] text-[10px] uppercase tracking-wider font-semibold text-[#6B6258]">
                <th className="px-4 py-2.5">Rider</th>
                <th className="px-4 py-2.5">Zone</th>
                <th className="px-4 py-2.5">Clock In</th>
                <th className="px-4 py-2.5">Clock Out</th>
                <th className="px-4 py-2.5 text-right">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE2]">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-emerald-50/10 transition-all">
                  <td className="px-4 py-3 font-semibold text-[#1A1410]">{log.riderName}</td>
                  <td className="px-4 py-3 text-[#6B6258]">{log.zoneName}</td>
                  <td className="px-4 py-3 font-mono">{log.timeIn || '—'}</td>
                  <td className="px-4 py-3 font-mono">{log.timeOut || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <Clock className="w-3 h-3" />
                      {log.hours.toFixed(1)}h
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   3. Absent / No Time-In Sub-component
   ========================================================================== */
function AbsentHRDetail({ logs, riders }: { logs: AttendanceLog[]; riders: Rider[] }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = logs.filter(l => 
    l.riderName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    l.zoneName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRiderPhone = (riderId: string) => {
    return riders.find(r => r.id === riderId)?.phone || '';
  };

  return (
    <div className="space-y-3">
      {/* Alert Banner */}
      <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-100 rounded-xl">
        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
        <div className="text-[11px] text-red-900 font-medium">
          Riders listed here have either missed sign-in or are officially flagged absent. Please follow up with them directly.
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#6B6258]" />
        <input
          type="text"
          placeholder="Search absent riders..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAFAF7] border border-[#EFEAE2] rounded-lg outline-none focus:border-[#db6c00]/50 focus:bg-white text-[#1A1410] transition-colors"
        />
      </div>

      {/* List */}
      <div className="max-h-[250px] overflow-y-auto pr-1 border border-[#EFEAE2] rounded-xl bg-white custom-scrollbar">
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#6B6258]">
            No absent riders tracked today.
          </div>
        ) : (
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-[#FAFAF7] border-b border-[#EFEAE2] text-[10px] uppercase tracking-wider font-semibold text-[#6B6258]">
                <th className="px-4 py-2.5">Rider</th>
                <th className="px-4 py-2.5">Zone</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE2]">
              {filteredLogs.map((log) => {
                const phone = getRiderPhone(log.riderId);
                return (
                  <tr key={log.id} className="hover:bg-red-50/10 transition-all">
                    <td className="px-4 py-3 font-semibold text-[#1A1410]">{log.riderName}</td>
                    <td className="px-4 py-3 text-[#6B6258]">{log.zoneName}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700 border border-red-150">
                        <UserX className="w-3 h-3" />
                        No Time-In
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {phone ? (
                        <a
                          href={`tel:${phone}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-all"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          Call Rider
                        </a>
                      ) : (
                        <span className="text-gray-400 font-mono text-[10px]">No Phone</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   4. Pending Validation Sub-component
   ========================================================================== */
function PendingValidationHRDetail({ logs }: { logs: AttendanceLog[] }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = logs.filter(l => 
    l.riderName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    l.zoneName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getReasonLabel = (log: AttendanceLog) => {
    if (log.source === 'manual') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          Manual Entry
        </span>
      );
    }
    if (log.timeIn && !log.timeOut) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          Ongoing / Missing Out
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-50 text-gray-700 border border-gray-200">
        Review Log
      </span>
    );
  };

  return (
    <div className="space-y-3">
      {/* Alert Header */}
      <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
        <div className="text-[11px] text-amber-900 font-medium">
          These logs are flagged because they either represent manual adjustments (requiring audit) or active duty logs that haven't been signed out.
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#6B6258]" />
        <input
          type="text"
          placeholder="Search pending validations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAFAF7] border border-[#EFEAE2] rounded-lg outline-none focus:border-[#db6c00]/50 focus:bg-white text-[#1A1410] transition-colors"
        />
      </div>

      {/* List */}
      <div className="max-h-[250px] overflow-y-auto pr-1 border border-[#EFEAE2] rounded-xl bg-white custom-scrollbar">
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#6B6258]">
            No pending validations requiring review.
          </div>
        ) : (
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-[#FAFAF7] border-b border-[#EFEAE2] text-[10px] uppercase tracking-wider font-semibold text-[#6B6258]">
                <th className="px-4 py-2.5">Rider</th>
                <th className="px-4 py-2.5">Zone</th>
                <th className="px-4 py-2.5">Flag Reason</th>
                <th className="px-4 py-2.5 text-right">Time In</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE2]">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-amber-50/10 transition-all">
                  <td className="px-4 py-3 font-semibold text-[#1A1410]">{log.riderName}</td>
                  <td className="px-4 py-3 text-[#6B6258]">{log.zoneName}</td>
                  <td className="px-4 py-3">{getReasonLabel(log)}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-[#1A1410]">
                    {log.timeIn || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
