import type { AttendancePresence, AttendanceStatus, PunctualityStatus } from '../../services/types';
import { CheckCircle2, Clock, CalendarX, AlertTriangle, ShieldCheck } from 'lucide-react';

interface StatusPillProps {
  status: AttendancePresence | AttendanceStatus;
}

export function StatusPill({ status }: StatusPillProps) {
  switch (status) {
    case 'present':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Present</span>
        </span>
      );
    case 'late':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/80 shadow-2xs">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span>Late</span>
        </span>
      );
    case 'on_leave':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs">
          <CalendarX className="w-3.5 h-3.5 text-slate-500" />
          <span>On Leave</span>
        </span>
      );
    case 'absent':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
          <span>Absent</span>
        </span>
      );
    default:
      return null;
  }
}

interface PunctualityPillProps {
  punctuality: PunctualityStatus;
}

export function PunctualityPill({ punctuality }: PunctualityPillProps) {
  switch (punctuality) {
    case 'on_time':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>On Time</span>
        </span>
      );
    case 'late':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/80 shadow-2xs">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span>Late</span>
        </span>
      );
    case 'none':
    default:
      return <span className="text-xs text-muted-foreground font-mono">—</span>;
  }
}
