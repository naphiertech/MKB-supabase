import type { Role } from '../hooks/useAuth';
import { PayrollParcelRatesSettings } from '../components/payroll/PayrollParcelRatesSettings';

interface ParcelRatesProps {
  role: Role;
}

export function ParcelRates({ role }: ParcelRatesProps) {
  return (
    <div className="dashboard-page space-y-5">
      <PayrollParcelRatesSettings role={role} />
    </div>
  );
}
