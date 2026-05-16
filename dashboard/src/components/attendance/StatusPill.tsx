import type { AttendanceStatus } from '../../services/mockData';
interface StatusPillProps {
  status: AttendanceStatus;
}
const STYLES: Record<
  AttendanceStatus,
  {
    bg: string;
    text: string;
    border: string;
    label: string;
    dot: string;
  }> =
{
  present: {
    bg: 'bg-[#DCFCE7]',
    text: 'text-[#16A34A]',
    border: 'border-[#16A34A]/25',
    label: 'Present',
    dot: 'bg-[#16A34A]'
  },
  late: {
    bg: 'bg-[#FEF3C7]',
    text: 'text-[#D97706]',
    border: 'border-[#D97706]/25',
    label: 'Late',
    dot: 'bg-[#D97706]'
  },
  on_leave: {
    bg: 'bg-[#FAFAF7]',
    text: 'text-[#475569]',
    border: 'border-[#475569]/25',
    label: 'On Leave',
    dot: 'bg-[#475569]'
  },
  absent: {
    bg: 'bg-[#FEE2E2]',
    text: 'text-[#DC2626]',
    border: 'border-[#DC2626]/25',
    label: 'Absent',
    dot: 'bg-[#DC2626]'
  }
};
export function StatusPill({ status }: StatusPillProps) {
  const s = STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${s.bg} ${s.text} ${s.border}`}>
      
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>);

}