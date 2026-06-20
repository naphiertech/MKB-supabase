import { useState } from 'react';
import { useNow, relativeTime } from '../../hooks/useNow';
import type { Rider, AttendanceLog, ViolationEvent, Zone } from '../../services/types';
import { 
  Search, 
  Phone, 
  Clock, 
  AlertTriangle, 
  MapPin, 
  Eye,
  Zap,
  Calendar,
  X
} from 'lucide-react';

interface StatDetailsPanelProps {
  type: 'active_riders' | 'on_duty' | 'violations' | 'attendance';
  onClose: () => void;
  riders: Rider[];
  zones: Zone[];
  logs: AttendanceLog[];
  violations: ViolationEvent[];
  onViewViolation: (riderId: string) => void;
  attendanceList: AttendanceLog[];
}

export function StatDetailsPanel({
  type,
  onClose,
  riders,
  zones,
  logs,
  violations,
  onViewViolation,
  attendanceList
}: StatDetailsPanelProps) {
  const now = useNow();

  // Color theme mapping based on card types
  const themes = {
    active_riders: {
      border: 'border-[#db6c00]/30',
      bg: 'bg-[#FFF1E0]/5',
      badge: 'bg-[#FFF1E0] text-[#db6c00] border-[#db6c00]/20',
      title: 'Total Active Riders Details'
    },
    on_duty: {
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-50/5',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      title: 'On Duty Today Details'
    },
    violations: {
      border: 'border-red-500/30',
      bg: 'bg-red-50/5',
      badge: 'bg-red-50 text-red-700 border-red-200',
      title: 'Geofence Violations Details'
    },
    attendance: {
      border: 'border-amber-500/30',
      bg: 'bg-amber-50/5',
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      title: 'Attendance Rate & Trends'
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

      {/* Render matching panel details */}
      {type === 'active_riders' && (
        <ActiveRidersDetail riders={riders} zones={zones} now={now} />
      )}
      {type === 'on_duty' && (
        <OnDutyDetail logs={logs} />
      )}
      {type === 'violations' && (
        <ViolationsDetail violations={violations} onViewViolation={onViewViolation} now={now} />
      )}
      {type === 'attendance' && (
        <AttendanceDetail logs={attendanceList} />
      )}
    </div>
  );
}

/* ==========================================================================
   1. Active Riders Details Sub-component
   ========================================================================== */
function ActiveRidersDetail({ riders, zones, now }: { riders: Rider[]; zones: Zone[]; now: number }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'offline'>('all');

  const getZoneName = (zoneId: string | null) => {
    if (!zoneId) return 'Unassigned';
    return zones.find(z => z.id === zoneId)?.name || 'Unassigned';
  };

  const activeRiders = riders.filter(r => r.status !== 'offline');
  const offlineRiders = riders.filter(r => r.status === 'offline');

  const filteredRiders = riders.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          r.riderCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          r.phone.includes(searchQuery);
    
    if (activeTab === 'active') return matchesSearch && r.status !== 'offline';
    if (activeTab === 'offline') return matchesSearch && r.status === 'offline';
    return matchesSearch;
  });

  return (
    <div className="space-y-4">
      {/* Stats Quick Grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#FAFAF7] border border-[#EFEAE2] rounded-xl p-3 text-center">
          <div className="text-xl font-semibold text-[#1A1410]">{riders.length}</div>
          <div className="text-[10px] text-[#6B6258] uppercase tracking-wider font-semibold">Total Accounts</div>
        </div>
        <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 text-center">
          <div className="text-xl font-semibold text-emerald-700">{activeRiders.length}</div>
          <div className="text-[10px] text-emerald-600 uppercase tracking-wider font-semibold">Active Now</div>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
          <div className="text-xl font-semibold text-gray-600">{offlineRiders.length}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Offline</div>
        </div>
      </div>

      {/* Filter and Search Row */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pt-1 border-t border-[#EFEAE2]/60">
        <div className="flex rounded-lg bg-[#FAFAF7] p-0.5 border border-[#EFEAE2] w-full sm:w-auto">
          {(['all', 'active', 'offline'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium capitalize rounded-md transition-all ${
                activeTab === tab 
                  ? 'bg-white text-[#1A1410] shadow-sm' 
                  : 'text-[#6B6258] hover:text-[#1A1410]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#6B6258]" />
          <input
            type="text"
            placeholder="Search by name, code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAFAF7] border border-[#EFEAE2] rounded-lg outline-none focus:border-[#db6c00]/50 focus:bg-white text-[#1A1410] transition-colors"
          />
        </div>
      </div>

      {/* List */}
      <div className="max-h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
        {filteredRiders.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#6B6258] border border-dashed border-[#EFEAE2] rounded-xl bg-[#FAFAF7]">
            No matching riders found.
          </div>
        ) : (
          filteredRiders.map((rider) => (
            <div key={rider.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white border border-[#EFEAE2] hover:border-[#db6c00]/25 rounded-xl transition-all">
              <div className="flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  {rider.avatar ? (
                    <img src={rider.avatar} alt={rider.name} className="w-10 h-10 rounded-full object-cover border border-[#EFEAE2]" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#FFF1E0] flex items-center justify-center font-bold text-[#db6c00] text-sm">
                      {rider.name.charAt(0)}
                    </div>
                  )}
                  <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
                    rider.status === 'offline' ? 'bg-gray-400' : rider.status === 'violation' ? 'bg-red-500' : rider.status === 'idle' ? 'bg-amber-400' : 'bg-emerald-500'
                  }`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold text-[#1A1410]">{rider.name}</h4>
                    <span className="text-[10px] text-[#6B6258] font-mono font-medium">{rider.riderCode}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[10px] text-[#6B6258]">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#db6c00]/70" />
                      {getZoneName(rider.zoneId)}
                    </span>
                    <span>•</span>
                    <span>Shift: <span className="capitalize">{rider.shift}</span></span>
                    {rider.status !== 'offline' && (
                      <>
                        <span>•</span>
                        <span>Speed: {rider.speed} km/h</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#EFEAE2]/60">
                <div className="text-left sm:text-right">
                  <div className="text-[10px] text-[#6B6258]">Last Active</div>
                  <div className="text-[11px] font-mono text-[#1A1410] font-medium mt-0.5">
                    {relativeTime(rider.lastPing, now)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a href={`tel:${rider.phone}`} className="p-1.5 text-[#6B6258] hover:text-[#db6c00] bg-[#FAFAF7] hover:bg-[#FFF1E0] border border-[#EFEAE2] rounded-lg transition-all" title="Call Rider">
                    <Phone className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   2. On Duty Details Sub-component
   ========================================================================== */
function OnDutyDetail({ logs }: { logs: AttendanceLog[] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'late'>('all');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const filteredLogs = logs.filter(l => {
    const matchesSearch = l.riderName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          l.zoneName.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (statusFilter === 'present') return matchesSearch && l.status === 'present';
    if (statusFilter === 'late') return matchesSearch && l.status === 'late';
    return matchesSearch;
  });

  const presentCount = logs.filter(l => l.status === 'present').length;
  const lateCount = logs.filter(l => l.status === 'late').length;

  const getStatusBadge = (status: AttendanceLog['status']) => {
    switch (status) {
      case 'present':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">Present</span>;
      case 'late':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-100">Late Clock-in</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-gray-600 border border-gray-200">{status}</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Metrics Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#FAFAF7] border border-[#EFEAE2] rounded-xl p-3 text-center">
          <div className="text-xl font-semibold text-[#1A1410]">{logs.length}</div>
          <div className="text-[10px] text-[#6B6258] uppercase tracking-wider font-semibold">Total Clocked-In</div>
        </div>
        <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 text-center">
          <div className="text-xl font-semibold text-emerald-700">{presentCount}</div>
          <div className="text-[10px] text-emerald-600 uppercase tracking-wider font-semibold">On Time</div>
        </div>
        <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3 text-center">
          <div className="text-xl font-semibold text-amber-700">{lateCount}</div>
          <div className="text-[10px] text-amber-600 uppercase tracking-wider font-semibold">Late Check-In</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pt-1 border-t border-[#EFEAE2]/60">
        <div className="flex rounded-lg bg-[#FAFAF7] p-0.5 border border-[#EFEAE2] w-full sm:w-auto">
          {(['all', 'present', 'late'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1.5 text-xs font-medium capitalize rounded-md transition-all ${
                statusFilter === filter 
                  ? 'bg-white text-[#1A1410] shadow-sm' 
                  : 'text-[#6B6258] hover:text-[#1A1410]'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#6B6258]" />
          <input
            type="text"
            placeholder="Search name, zone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAFAF7] border border-[#EFEAE2] rounded-lg outline-none focus:border-[#db6c00]/50 focus:bg-white text-[#1A1410] transition-colors"
          />
        </div>
      </div>

      {/* List */}
      <div className="max-h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#6B6258] border border-dashed border-[#EFEAE2] rounded-xl bg-[#FAFAF7]">
            No attendance logs found for today.
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white border border-[#EFEAE2] rounded-xl hover:border-[#db6c00]/25 transition-all">
              <div className="flex items-center gap-3">
                {log.riderAvatar ? (
                  <img src={log.riderAvatar} alt={log.riderName} className="w-10 h-10 rounded-full object-cover border border-[#EFEAE2]" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#FFF1E0] flex items-center justify-center font-bold text-[#db6c00] text-sm">
                    {log.riderName.charAt(0)}
                  </div>
                )}
                <div>
                  <h4 className="text-xs font-semibold text-[#1A1410]">{log.riderName}</h4>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[10px] text-[#6B6258]">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#db6c00]/70" />
                      {log.zoneName}
                    </span>
                    <span>•</span>
                    <span className="capitalize">Method: {log.source}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#EFEAE2]/60">
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-left sm:text-right">
                  <div>
                    <span className="text-[9px] text-[#6B6258] uppercase">Clock In</span>
                    <div className="text-xs font-mono font-semibold text-[#1A1410]">{log.timeIn || '--:--'}</div>
                  </div>
                  <div>
                    <span className="text-[9px] text-[#6B6258] uppercase">Clock Out</span>
                    <div className="text-xs font-mono font-semibold text-[#1A1410]">{log.timeOut || '--:--'}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {getStatusBadge(log.status)}
                  {log.faceScanUrl ? (
                    <button
                      onClick={() => setSelectedPhoto(log.faceScanUrl || null)}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] text-[#db6c00] hover:text-[#b85a00] bg-[#FFF1E0] border border-[#db6c00]/20 rounded-md font-semibold transition-all"
                    >
                      <Eye className="w-3 h-3" />
                      Scan
                    </button>
                  ) : (
                    <span className="text-[10px] text-gray-400 font-mono px-2 py-1 bg-gray-50 border border-gray-100 rounded-md">No Image</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Face Scan Sub-modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/60 p-4">
          <div className="relative max-w-sm w-full bg-white rounded-2xl overflow-hidden shadow-2xl p-4">
            <div className="flex justify-between items-center pb-3 border-b border-[#EFEAE2]">
              <span className="text-xs font-semibold text-[#1A1410]">Clock-in Face Verification</span>
              <button 
                onClick={() => setSelectedPhoto(null)} 
                className="text-[#6B6258] hover:text-[#1A1410] p-1 rounded-md hover:bg-[#FAFAF7]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 flex justify-center bg-[#FAFAF7] rounded-xl overflow-hidden border border-[#EFEAE2]">
              <img src={selectedPhoto} alt="Face Scan Preview" className="max-h-[300px] w-auto object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   3. Violations Details Sub-component
   ========================================================================== */
function ViolationsDetail({ 
  violations, 
  onViewViolation, 
  now 
}: { 
  violations: ViolationEvent[]; 
  onViewViolation: (riderId: string) => void; 
  now: number;
}) {
  const getViolationTypeLabel = (type: ViolationEvent['type']) => {
    switch (type) {
      case 'boundary_exit':
        return 'Boundary Exit';
      case 'boundary_enter':
        return 'Boundary Enter';
      case 'idle_excess':
        return 'Excessive Idle Time';
      default:
        return type;
    }
  };

  const getViolationStyle = (type: ViolationEvent['type']) => {
    switch (type) {
      case 'boundary_exit':
        return {
          icon: AlertTriangle,
          bg: 'bg-red-50 text-red-600 border-red-200',
        };
      case 'boundary_enter':
        return {
          icon: Zap,
          bg: 'bg-indigo-50 text-indigo-600 border-indigo-200',
        };
      case 'idle_excess':
        return {
          icon: Clock,
          bg: 'bg-amber-50 text-amber-600 border-amber-200',
        };
      default:
        return {
          icon: AlertTriangle,
          bg: 'bg-gray-50 text-gray-600 border-gray-200',
        };
    }
  };

  return (
    <div className="space-y-4">
      {/* Count summary alert banner */}
      <div className="flex items-center gap-3 p-3 bg-red-50/50 border border-red-100 rounded-xl">
        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 animate-bounce" />
        <div>
          <div className="text-xs font-semibold text-red-900">
            {violations.length} {violations.length === 1 ? 'Violation' : 'Violations'} Tracked
          </div>
          <div className="text-[10px] text-red-700 mt-0.5">
            Supervisor attention required to enforce geofence compliance.
          </div>
        </div>
      </div>

      {/* List */}
      <div className="max-h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
        {violations.length === 0 ? (
          <div className="py-16 text-center text-xs text-[#6B6258] border border-dashed border-[#EFEAE2] rounded-xl bg-[#FAFAF7]">
            Awesome! No active geofence violations today.
          </div>
        ) : (
          violations.map((v) => {
            const style = getViolationStyle(v.type);
            const Icon = style.icon;
            return (
              <div key={v.id} className={`flex items-center justify-between gap-3 p-3 bg-white border ${v.read ? 'border-[#EFEAE2]' : 'border-red-200 shadow-sm'} rounded-xl hover:shadow-sm transition-all`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${style.bg} flex-shrink-0`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-[#1A1410] truncate max-w-[120px]">{v.riderName}</span>
                      {!v.read && (
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full" title="Unread Alert" />
                      )}
                      <span className="text-[10px] text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.2 rounded-md font-medium">
                        {getViolationTypeLabel(v.type)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-[#6B6258] mt-1">
                      <MapPin className="w-3 h-3 text-[#db6c00]/60" />
                      <span>Zone: <span className="font-semibold">{v.zoneName}</span></span>
                      <span>•</span>
                      <span>{relativeTime(v.ts, now)}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onViewViolation(v.riderId)}
                  className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-semibold text-white bg-[#db6c00] hover:bg-[#b85a00] rounded-lg transition-all shadow-sm active:scale-[0.98]"
                >
                  <MapPin className="w-3 h-3" />
                  View Map
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   4. Attendance Details Sub-component
   ========================================================================== */
function AttendanceDetail({ logs }: { logs: AttendanceLog[] }) {
  const getLocalDateStringStr = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const presentCount = logs.filter(l => l.status === 'present' || l.status === 'late').length;
  const totalCount = logs.length;
  const rate = totalCount ? Math.round((presentCount / totalCount) * 100) : 0;
  const target = 92;
  const targetMet = rate >= target;

  // Calculate last 7 days trend
  const dailyTrends = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateStringStr(d);
    
    const dayLogs = logs.filter(l => l.date === dateStr);
    const dayPresent = dayLogs.filter(l => l.status === 'present' || l.status === 'late').length;
    const dayRate = dayLogs.length ? Math.round((dayPresent / dayLogs.length) * 100) : null;
    
    return {
      date: dateStr,
      label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      total: dayLogs.length,
      present: dayPresent,
      rate: dayRate
    };
  }).reverse();

  return (
    <div className="space-y-4">
      {/* Main circular percentage card */}
      <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-white border border-[#EFEAE2] rounded-xl shadow-sm">
        {/* Progress Circular Gauge */}
        <div className="relative flex items-center justify-center w-24 h-24 flex-shrink-0">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              className="text-[#EFEAE2]"
              strokeWidth="8"
              stroke="currentColor"
              fill="transparent"
              r="40"
              cx="48"
              cy="48"
            />
            <circle
              className={`transition-all duration-500 ease-out ${targetMet ? 'text-emerald-500' : 'text-amber-500'}`}
              strokeWidth="8"
              strokeDasharray={251.2}
              strokeDashoffset={251.2 - (rate / 100) * 251.2}
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
              r="40"
              cx="48"
              cy="48"
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center text-center">
            <span className="text-xl font-bold text-[#1A1410]">{rate}%</span>
          </div>
        </div>

        <div className="flex-1 text-center sm:text-left space-y-1">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <h3 className="text-xs font-semibold text-[#1A1410]">Overall Attendance Rate</h3>
            {targetMet ? (
              <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">Target Met</span>
            ) : (
              <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-md">Below Target</span>
            )}
          </div>
          <p className="text-[11px] text-[#6B6258]">
            Current active attendance rate is {rate}%. The target set by operations is ≥ {target}%.
          </p>
          <div className="flex items-center justify-center sm:justify-start gap-4 pt-1 text-[10px] font-semibold text-[#6B6258]">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Target: {target}%
            </span>
            <span className="flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-full ${targetMet ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              Actual: {rate}%
            </span>
          </div>
        </div>
      </div>

      {/* 7-Day Trend Breakdown */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1A1410]">
          <Calendar className="w-4 h-4 text-[#db6c00]" />
          <span>Last 7 Days Trend</span>
        </div>

        <div className="border border-[#EFEAE2] rounded-xl overflow-hidden bg-white">
          <div className="grid grid-cols-3 px-3 py-2 bg-[#FAFAF7] border-b border-[#EFEAE2] text-[10px] uppercase font-semibold tracking-wider text-[#6B6258]">
            <div>Date</div>
            <div className="text-center">Active/Total Logs</div>
            <div className="text-right">Daily Rate</div>
          </div>
          <div className="divide-y divide-[#EFEAE2] max-h-[160px] overflow-y-auto custom-scrollbar">
            {dailyTrends.map((t) => (
              <div key={t.date} className="grid grid-cols-3 items-center px-3 py-2 text-xs">
                <div className="font-medium text-[#1A1410]">{t.label}</div>
                <div className="text-center text-[#6B6258]">
                  {t.total > 0 ? `${t.present} / ${t.total}` : 'No Logs'}
                </div>
                <div className="text-right font-mono font-semibold">
                  {t.rate !== null ? (
                    <span className={t.rate >= target ? 'text-emerald-600' : 'text-amber-600'}>
                      {t.rate}%
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
