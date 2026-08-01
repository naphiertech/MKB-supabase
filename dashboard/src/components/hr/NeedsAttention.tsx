import { AlertCircle, Clock, ShieldAlert, UserCheck, ArrowRight } from 'lucide-react';
import type { AttendanceLog, ViolationEvent } from '../../services/types';

interface NeedsAttentionProps {
  attendanceLogs: AttendanceLog[];
  violations: ViolationEvent[];
  onNavigate: (page: 'attendance' | 'monitoring' | 'reports', params?: Record<string, string>) => void;
}

export function NeedsAttention({ attendanceLogs, violations, onNavigate }: NeedsAttentionProps) {
  // 1. Pending Manual Validations
  const manualLogs = attendanceLogs.filter((l) => l.source === 'manual' || l.notes?.toLowerCase().includes('manual'));
  
  // 2. Riders missing Time-Out (Clocked in today > 8 hrs ago without timeOut)
  const missingTimeOut = attendanceLogs.filter((l) => l.timeIn && !l.timeOut && l.hours >= 8);

  // 3. Late arrivals
  const lateArrivals = attendanceLogs.filter((l) => l.status === 'late');

  // 4. Active unresolved geofence violations
  const activeViolations = violations.filter((v) => !v.read || !v.resolved);

  const totalPriorityCount = manualLogs.length + missingTimeOut.length + lateArrivals.length + activeViolations.length;

  return (
    <div className="bg-[#FFF8F0] border border-[#FFE8D1] rounded-xl p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center shadow-2xs">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              Needs Attention{' '}
              <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-primary text-white">
                {totalPriorityCount}
              </span>
            </h3>
            <p className="text-[11px] text-muted-foreground font-mono">HR Priority Action Items for Today</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Item 1: Manual Validations */}
        <div
          onClick={() => onNavigate('attendance', { status: 'manual' })}
          className="bg-white border border-border rounded-lg p-3 hover:border-primary/40 transition cursor-pointer flex flex-col justify-between shadow-2xs"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-mono">Manual Entry</span>
            <UserCheck className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold font-mono text-foreground">{manualLogs.length}</span>
            <span className="text-[11px] text-primary font-semibold flex items-center gap-0.5 hover:underline">
              Review <ArrowRight className="w-3 h-3" />
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">Awaiting HR verification</div>
        </div>

        {/* Item 2: Missing Time-Out */}
        <div
          onClick={() => onNavigate('attendance', { status: 'incomplete' })}
          className="bg-white border border-border rounded-lg p-3 hover:border-primary/40 transition cursor-pointer flex flex-col justify-between shadow-2xs"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-mono">No Time-Out</span>
            <Clock className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold font-mono text-foreground">{missingTimeOut.length}</span>
            <span className="text-[11px] text-primary font-semibold flex items-center gap-0.5 hover:underline">
              View <ArrowRight className="w-3 h-3" />
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">Shift exceeds 8 hrs without clock-out</div>
        </div>

        {/* Item 3: Late Arrivals */}
        <div
          onClick={() => onNavigate('attendance', { status: 'late' })}
          className="bg-white border border-border rounded-lg p-3 hover:border-primary/40 transition cursor-pointer flex flex-col justify-between shadow-2xs"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-mono">Late Arrivals</span>
            <Clock className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold font-mono text-foreground">{lateArrivals.length}</span>
            <span className="text-[11px] text-primary font-semibold flex items-center gap-0.5 hover:underline">
              Audit <ArrowRight className="w-3 h-3" />
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">Clocked in past shift start time</div>
        </div>

        {/* Item 4: Active Geofence Violations */}
        <div
          onClick={() => onNavigate('monitoring')}
          className="bg-white border border-border rounded-lg p-3 hover:border-red-300 transition cursor-pointer flex flex-col justify-between shadow-2xs"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-mono">Active Violations</span>
            <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold font-mono text-red-600">{activeViolations.length}</span>
            <span className="text-[11px] text-red-600 font-semibold flex items-center gap-0.5 hover:underline">
              Inspect <ArrowRight className="w-3 h-3" />
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">Unresolved geofence boundary alerts</div>
        </div>
      </div>
    </div>
  );
}
