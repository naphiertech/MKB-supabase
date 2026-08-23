import {
  Target,
  ShieldCheck,
  Users as UsersIcon,
  AlertTriangle
} from 'lucide-react';
import { StatCard } from '../common/StatCard';
import type { Zone, Rider } from '../../services/types';

interface ZoneSummaryCardsProps {
  zones: Zone[];
  riders: Rider[];
  violationsToday: number;
  onTotalZonesClick?: () => void;
  onActiveZonesClick?: () => void;
  onRidersAssignedClick?: () => void;
  onViolationsTodayClick?: () => void;
}

export function ZoneSummaryCards({
  zones,
  riders,
  violationsToday,
  onTotalZonesClick,
  onActiveZonesClick,
  onRidersAssignedClick,
  onViolationsTodayClick
}: ZoneSummaryCardsProps) {
  const totalZones = zones.length;
  const activeZones = zones.filter(
    (z) => (z.status ?? 'active') === 'active'
  ).length;
  const ridersAssigned = riders.filter((r) => r.zoneId).length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <StatCard
        label="Total Zones"
        value={totalZones}
        sub={`${zones.length} configured`}
        icon={Target}
        accent="blue"
        onClick={onTotalZonesClick}
      />

      <StatCard
        label="Active Zones"
        value={
          <>
            <span className="text-foreground">{activeZones}</span>
            <span className="text-muted-foreground text-xl"> / {totalZones}</span>
          </>
        }
        sub={`${totalZones - activeZones} inactive`}
        icon={ShieldCheck}
        accent="green"
        pulse={activeZones > 0}
        onClick={onActiveZonesClick}
      />

      <StatCard
        label="Riders Assigned"
        value={ridersAssigned}
        sub={`${riders.length - ridersAssigned} unassigned`}
        icon={UsersIcon}
        accent="amber"
        onClick={onRidersAssignedClick}
      />

      <StatCard
        label="Violations Today"
        value={
          <span className={violationsToday > 0 ? 'text-red-600' : undefined}>
            {violationsToday}
          </span>
        }
        sub={violationsToday > 0 ? 'Action required' : 'All clear'}
        icon={AlertTriangle}
        accent="red"
        onClick={onViolationsTodayClick}
      />
    </div>
  );
}
