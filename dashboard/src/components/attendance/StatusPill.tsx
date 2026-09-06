import type { AttendancePresence, AttendanceStatus, PunctualityStatus } from '../../services/types';
import { getAttendanceContextLabel, type AttendanceContextCode, type AttendanceContextStatus } from '../../services/attendance/attendanceContextService';
import { CheckCircle2, Clock, CalendarX, AlertTriangle, ShieldCheck } from 'lucide-react';
import { StatusBadge } from '../common/DashboardPrimitives';

interface StatusPillProps {
  status: AttendancePresence | AttendanceStatus | AttendanceContextStatus;
}

export function StatusPill({ status }: StatusPillProps) {
  switch (status) {
    case 'present':
      return (
        <StatusBadge tone="success" size="md" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
          Present
        </StatusBadge>
      );
    case 'late':
      return (
        <StatusBadge tone="warning" size="md" icon={<Clock className="h-3.5 w-3.5" />}>
          Late
        </StatusBadge>
      );
    case 'on_leave':
      return (
        <StatusBadge tone="info" size="md" icon={<CalendarX className="h-3.5 w-3.5" />}>
          On Leave
        </StatusBadge>
      );
    case 'absent':
      return (
        <StatusBadge tone="danger" size="md" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
          Absent
        </StatusBadge>
      );
    case 'day_off':
      return (
        <StatusBadge tone="neutral" size="md" icon={<CalendarX className="h-3.5 w-3.5" />}>
          Day Off
        </StatusBadge>
      );
    case 'not_finalized':
      return (
        <StatusBadge tone="neutral" size="md" icon={<Clock className="h-3.5 w-3.5" />}>
          Pending
        </StatusBadge>
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
        <StatusBadge tone="success" size="md" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
          On Time
        </StatusBadge>
      );
    case 'late':
      return (
        <StatusBadge tone="warning" size="md" icon={<Clock className="h-3.5 w-3.5" />}>
          Late
        </StatusBadge>
      );
    case 'none':
    default:
      return <span className="text-xs text-muted-foreground font-mono">—</span>;
  }
}

export function AttendanceContextBadge({ code }: { code: AttendanceContextCode | null | undefined }) {
  const label = getAttendanceContextLabel(code);
  if (!label) return null;
  return (
    <span className="inline-flex max-w-full items-center rounded-md border border-border bg-panel-bg px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
      {label}
    </span>
  );
}

export type { AttendanceContextStatus };
