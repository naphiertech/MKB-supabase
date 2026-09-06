import { useState } from 'react';
import type { AttendanceContextLog } from '../../services/attendance/attendanceContextService';
import { getAttendanceContextLabel } from '../../services/attendance/attendanceContextService';
import { 
  Search, 
  Clock, 
  Calendar, 
  MapPin, 
  UserCheck, 
  UserX, 
  AlertCircle,
  Eye,
  X
} from 'lucide-react';

interface AttendanceDetailsPanelProps {
  type: 'present' | 'late' | 'absent' | 'on_leave';
  onClose: () => void;
  logs: AttendanceContextLog[];
}

export function AttendanceDetailsPanel({
  type,
  onClose,
  logs
}: AttendanceDetailsPanelProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // Theme configuration matching card accents
  const themes = {
    present: {
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-50/5',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      title: 'Riders Present Today'
    },
    late: {
      border: 'border-amber-500/30',
      bg: 'bg-amber-50/5',
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      title: 'Riders Late Today'
    },
    absent: {
      border: 'border-red-500/30',
      bg: 'bg-red-50/5',
      badge: 'bg-red-50 text-red-700 border-red-200',
      title: 'Riders Absent Today'
    },
    on_leave: {
      border: 'border-blue-500/30',
      bg: 'bg-blue-50/5',
      badge: 'bg-blue-50 text-blue-700 border-blue-200',
      title: 'Riders On Leave Today'
    }
  };

  const currentTheme = themes[type];

  return (
    <div className={`border-2 ${currentTheme.border} rounded-xl bg-white p-5 shadow-sm space-y-4 transition-all duration-300 relative`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider border ${currentTheme.badge}`}>
            {type.replace('_', ' ')}
          </span>
          <h3 className="text-sm font-semibold text-foreground">{currentTheme.title}</h3>
        </div>
        <button 
          onClick={onClose} 
          className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-panel-bg transition-all"
          aria-label="Close Details Panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Detail list content */}
      {type === 'present' && (
        <PresentRidersDetail logs={logs} onSelectPhoto={setSelectedPhoto} />
      )}
      {type === 'late' && (
        <LateRidersDetail logs={logs} onSelectPhoto={setSelectedPhoto} />
      )}
      {type === 'absent' && (
        <AbsentRidersDetail logs={logs} />
      )}
      {type === 'on_leave' && (
        <OnLeaveRidersDetail logs={logs} />
      )}

      {/* Face Scan Sub-modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/60 p-4">
          <div className="relative max-w-sm w-full bg-white rounded-2xl overflow-hidden shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-3 border-b border-border">
              <span className="text-xs font-semibold text-foreground">Clock-in Face Verification</span>
              <button 
                onClick={() => setSelectedPhoto(null)} 
                className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-panel-bg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 flex justify-center bg-panel-bg rounded-xl overflow-hidden border border-border">
              <img src={selectedPhoto} alt="Face Scan Preview" className="max-h-[300px] w-auto object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   1. Present Riders Details
   ========================================================================== */
interface DetailProps {
  logs: AttendanceContextLog[];
  onSelectPhoto: (url: string) => void;
}

function PresentRidersDetail({ logs, onSelectPhoto }: DetailProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = logs.filter(l => 
    l.status === 'present' &&
    (l.riderName.toLowerCase().includes(searchQuery.toLowerCase()) || 
     l.zoneName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search present riders by name or zone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-panel-bg border border-border rounded-lg outline-none focus:border-primary/50 focus:bg-white text-foreground transition-colors"
        />
      </div>

      <div className="max-h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl bg-panel-bg">
            No present records found.
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id || `${log.riderId}-${log.date}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white border border-border rounded-xl hover:border-emerald-500/25 transition-all">
              <div className="flex items-center gap-3">
                {log.riderAvatar ? (
                  <img src={log.riderAvatar} alt={log.riderName} className="w-10 h-10 rounded-full object-cover border border-border" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center font-bold text-primary text-sm">
                    {log.riderName.charAt(0)}
                  </div>
                )}
                <div>
                  <h4 className="text-xs font-semibold text-foreground">{log.riderName}</h4>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-primary/70" />
                      {log.zoneName}
                    </span>
                    <span>•</span>
                    <span className="capitalize">Method: {log.source}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/60">
                <div className="text-left sm:text-right">
                  <span className="text-[9px] text-muted-foreground uppercase">Arrival Time</span>
                  <div className="text-xs font-mono font-semibold text-emerald-600 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" />
                    {log.timeIn || '—'}
                  </div>
                </div>
                {log.faceScanUrl ? (
                  <button
                    onClick={() => onSelectPhoto(log.faceScanUrl || '')}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] text-primary hover:text-accent-foreground bg-accent border border-primary/20 rounded-md font-semibold transition-all"
                  >
                    <Eye className="w-3 h-3" />
                    Photo Scan
                  </button>
                ) : (
                  <span className="text-[10px] text-gray-400 font-mono px-2.5 py-1.5 bg-gray-50 border border-gray-100 rounded-md">No Image</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   2. Late Riders Details
   ========================================================================== */
function LateRidersDetail({ logs, onSelectPhoto }: DetailProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = logs.filter(l => 
    l.status === 'late' &&
    (l.riderName.toLowerCase().includes(searchQuery.toLowerCase()) || 
     l.zoneName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search late riders by name or zone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-panel-bg border border-border rounded-lg outline-none focus:border-primary/50 focus:bg-white text-foreground transition-colors"
        />
      </div>

      <div className="max-h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl bg-panel-bg">
            No late records logged today.
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id || `${log.riderId}-${log.date}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white border border-amber-200 rounded-xl hover:border-amber-500/25 transition-all">
              <div className="flex items-center gap-3">
                {log.riderAvatar ? (
                  <img src={log.riderAvatar} alt={log.riderName} className="w-10 h-10 rounded-full object-cover border border-border" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center font-bold text-primary text-sm">
                    {log.riderName.charAt(0)}
                  </div>
                )}
                <div>
                  <h4 className="text-xs font-semibold text-foreground">{log.riderName}</h4>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-primary/70" />
                      {log.zoneName}
                    </span>
                    <span>•</span>
                    <span className="capitalize">Method: {log.source}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/60">
                <div className="text-left sm:text-right">
                  <span className="text-[9px] text-amber-700 uppercase">Arrival Time (Late)</span>
                  <div className="text-xs font-mono font-semibold text-amber-600 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {log.timeIn || '—'}
                  </div>
                </div>
                {log.faceScanUrl ? (
                  <button
                    onClick={() => onSelectPhoto(log.faceScanUrl || '')}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] text-primary hover:text-accent-foreground bg-accent border border-primary/20 rounded-md font-semibold transition-all"
                  >
                    <Eye className="w-3 h-3" />
                    Photo Scan
                  </button>
                ) : (
                  <span className="text-[10px] text-gray-400 font-mono px-2.5 py-1.5 bg-gray-50 border border-gray-100 rounded-md">No Image</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   3. Absent Riders Details
   ========================================================================== */
function AbsentRidersDetail({ logs }: { logs: AttendanceContextLog[] }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = logs.filter(l => 
    l.status === 'absent' &&
    (l.riderName.toLowerCase().includes(searchQuery.toLowerCase()) || 
     l.zoneName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-3">
      {/* Alert Warning Box */}
      <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-100 rounded-xl">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
        <div className="text-[11px] text-red-900 font-medium">
            No clocks were recorded for these Riders. Review the context badge before following up.
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search absent riders by name or zone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-panel-bg border border-border rounded-lg outline-none focus:border-primary/50 focus:bg-white text-foreground transition-colors"
        />
      </div>

      <div className="max-h-[250px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl bg-panel-bg">
            No absent records logged for today.
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id || `${log.riderId}-${log.date}`} className="flex items-center justify-between gap-3 p-3 bg-white border border-red-100 hover:border-red-200 rounded-xl transition-all">
              <div className="flex items-center gap-3 min-w-0">
                {log.riderAvatar ? (
                  <img src={log.riderAvatar} alt={log.riderName} className="w-10 h-10 rounded-full object-cover border border-border" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center font-bold text-red-600 text-sm">
                    {log.riderName.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-foreground truncate">{log.riderName}</h4>
                  {log.contextCode && <div className="mt-1 text-[10px] font-medium text-muted-foreground">{getAttendanceContextLabel(log.contextCode)}</div>}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-primary/70" />
                      {log.zoneName}
                    </span>
                  </div>
                </div>
              </div>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-red-50 text-red-700 border border-red-100">
                <UserX className="w-3 h-3" />
                Absent
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   4. On Leave Riders Details
   ========================================================================== */
function OnLeaveRidersDetail({ logs }: { logs: AttendanceContextLog[] }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = logs.filter(l => 
    l.status === 'on_leave' &&
    (l.riderName.toLowerCase().includes(searchQuery.toLowerCase()) || 
     l.zoneName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search riders on leave by name or zone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-panel-bg border border-border rounded-lg outline-none focus:border-primary/50 focus:bg-white text-foreground transition-colors"
        />
      </div>

      <div className="max-h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl bg-panel-bg">
            No riders scheduled on leave today.
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id || `${log.riderId}-${log.date}`} className="flex items-center justify-between gap-3 p-3 bg-white border border-border rounded-xl hover:border-blue-500/25 transition-all">
              <div className="flex items-center gap-3">
                {log.riderAvatar ? (
                  <img src={log.riderAvatar} alt={log.riderName} className="w-10 h-10 rounded-full object-cover border border-border" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center font-bold text-primary text-sm">
                    {log.riderName.charAt(0)}
                  </div>
                )}
                  <div>
                    <h4 className="text-xs font-semibold text-foreground">{log.riderName}</h4>
                    {log.contextCode && <div className="mt-1 text-[10px] font-medium text-muted-foreground">{getAttendanceContextLabel(log.contextCode)}</div>}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-primary/70" />
                      {log.zoneName}
                    </span>
                  </div>
                </div>
              </div>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100 rounded-md">
                <Calendar className="w-3.5 h-3.5" />
                {getAttendanceContextLabel(log.contextCode) || 'On Leave'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
