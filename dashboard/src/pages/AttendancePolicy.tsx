import type { Role } from '../hooks/useAuth';
import { AttendancePolicySettings } from '../components/attendance/AttendancePolicySettings';

interface AttendancePolicyProps {
  role: Role;
}

export function AttendancePolicy({ role }: AttendancePolicyProps) {
  return (
    <div className="dashboard-page space-y-5">
      <AttendancePolicySettings role={role} />
    </div>
  );
}
