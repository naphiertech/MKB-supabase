import {
  Target,
  ShieldCheck,
  Users as UsersIcon,
  AlertTriangle } from
'lucide-react';
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
        spark={[3, 4, 4, 5, 5, 5, 5]}
        onClick={onTotalZonesClick} />
      
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
        trend={{
          direction: 'flat',
          value: 'stable'
        }}
        spark={[4, 4, 5, 5, 5, 5, 5]}
        onClick={onActiveZonesClick} />
      
      <StatCard
        label="Riders Assigned"
        value={ridersAssigned}
        sub={`${riders.length - ridersAssigned} unassigned`}
        icon={UsersIcon}
        accent="amber"
        trend={{
          direction: 'up',
          value: '+3 this week'
        }}
        spark={[10, 12, 14, 15, 16, 17, 18]}
        onClick={onRidersAssignedClick} />
      
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
        trend={{
          direction: violationsToday > 0 ? 'up' : 'flat',
          value:
          violationsToday > 0 ? `+${violationsToday} today` : 'no change',
          positive: false
        }}
        spark={[1, 2, 1, 3, 2, 4, violationsToday]}
        onClick={onViolationsTodayClick} />
      
    </div>);

}
