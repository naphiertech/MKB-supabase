import { useState } from 'react';
import { Layers } from 'lucide-react';
import type { RiderStatus } from '../../services/types';
import type { FleetSummary } from '../../lib/fleetRollup';

interface FleetRollupPanelProps {
  summary: FleetSummary;
  activeStatus: RiderStatus | null;
  onStatusSelect: (status: RiderStatus | null) => void;
  activeZoneId: string | null;
  onZoneSelect: (zoneId: string | null) => void;
  /** Zones shown before "Show all". */
  visibleZones?: number;
}

const STATUS_ORDER: { key: RiderStatus; label: string; dot: string; bar: string }[] = [
  { key: 'active', label: 'Online', dot: 'bg-emerald-500', bar: 'bg-emerald-500' },
  { key: 'idle', label: 'Idle', dot: 'bg-amber-500', bar: 'bg-amber-500' },
  { key: 'violation', label: 'Violation', dot: 'bg-red-500', bar: 'bg-red-500' },
  { key: 'offline', label: 'Offline', dot: 'bg-muted-foreground', bar: 'bg-border' },
];

export function FleetRollupPanel({
  summary,
  activeStatus,
  onStatusSelect,
  activeZoneId,
  onZoneSelect,
  visibleZones = 5,
}: FleetRollupPanelProps) {
  const [showAllZones, setShowAllZones] = useState(false);
  const zones = showAllZones ? summary.zones : summary.zones.slice(0, visibleZones);
  const hiddenZones = summary.zones.length - zones.length;

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm">
      <div className="flex items-center gap-2.5 p-3.5 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/25 flex items-center justify-center shrink-0">
          <Layers className="w-4 h-4 text-primary" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">Fleet Overview</div>
          <div className="text-[11px] text-muted-foreground font-mono tabular-nums">
            {summary.total} riders · {summary.zones.length} zones
          </div>
        </div>
      </div>

      <div className="p-3.5 space-y-4">
        <div className="space-y-2">
          <div
            className="flex h-2 w-full overflow-hidden rounded-full bg-panel-bg"
            role="img"
            aria-label={STATUS_ORDER.map((s) => `${summary.byStatus[s.key]} ${s.label}`).join(', ')}
          >
            {STATUS_ORDER.map((s) => (
              <div
                key={s.key}
                className={s.bar}
                style={{ width: `${summary.total ? (summary.byStatus[s.key] / summary.total) * 100 : 0}%` }}
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {STATUS_ORDER.map((s) => {
              const selected = activeStatus === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onStatusSelect(selected ? null : s.key)}
                  className={`flex items-center justify-between gap-2 px-2.5 h-8 rounded-md border text-xs transition cursor-pointer ${
                    selected
                      ? 'border-primary/40 bg-accent text-accent-foreground'
                      : 'border-border bg-white text-foreground hover:border-primary/30'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                  <span className="font-mono tabular-nums">{summary.byStatus[s.key]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-muted-foreground px-1">By zone</div>
          <ul className={showAllZones ? 'max-h-56 overflow-y-auto space-y-1 pr-0.5' : 'space-y-1'}>
            {zones.map((zone) => {
              const selected = activeZoneId === zone.zoneId;
              return (
                <li key={zone.zoneId}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onZoneSelect(selected ? null : zone.zoneId)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 h-8 rounded-md border text-xs transition cursor-pointer ${
                      selected
                        ? 'border-primary/40 bg-accent text-accent-foreground'
                        : 'border-transparent hover:bg-panel-bg text-foreground'
                    }`}
                  >
                    <span className="truncate font-medium">{zone.name}</span>
                    <span className="inline-flex items-center gap-2 shrink-0">
                      {zone.violations > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          {zone.violations}
                        </span>
                      )}
                      <span className="font-mono tabular-nums text-muted-foreground">{zone.total}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {summary.unassigned > 0 && (
            <div className="flex items-center justify-between px-2.5 pt-1 text-[11px] text-muted-foreground">
              <span>No zone assigned</span>
              <span className="font-mono tabular-nums">{summary.unassigned}</span>
            </div>
          )}
          {(hiddenZones > 0 || showAllZones) && summary.zones.length > visibleZones && (
            <button
              type="button"
              onClick={() => setShowAllZones((v) => !v)}
              className="px-2.5 pt-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
            >
              {showAllZones ? 'Show fewer zones' : `Show ${hiddenZones} more zones`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
