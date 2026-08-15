import type { AttendancePresence, AttendanceStatus, PunctualityStatus } from '../../services/types';
import { CheckCircle2, Clock, CalendarX, AlertTriangle, ShieldCheck } from 'lucide-react';
import { StatusBadge } from '../common/DashboardPrimitives';

interface StatusPillProps {
  status: AttendancePresence | AttendanceStatus;
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
