import { ChevronDown, Globe2 } from 'lucide-react';
import { useHub } from '../../context/HubContext';

export function HubSelector() {
  const { hubs, selectedHubId, canSelectAll, isReady, selectHub } = useHub();
  const disabled = !isReady || (!canSelectAll && hubs.length <= 1) || (canSelectAll && hubs.length === 0);

  return (
    <label className="relative flex min-h-11 min-w-0 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-white px-2 py-2 text-xs font-semibold text-foreground shadow-sm sm:gap-2 sm:px-2.5">
      <Globe2 className="hidden h-4 w-4 shrink-0 text-primary min-[420px]:block" aria-hidden="true" />
      <span className="sr-only">Hub workspace</span>
      <select
        aria-label="Hub workspace"
        value={selectedHubId ?? 'all'}
        disabled={disabled}
        onChange={(event) => selectHub(event.target.value === 'all' ? null : event.target.value)}
        className="min-w-0 max-w-[5.5rem] appearance-none truncate bg-transparent pr-5 outline-none disabled:cursor-not-allowed sm:max-w-[8rem] xl:max-w-[10rem] 2xl:max-w-[14rem]"
      >
        {canSelectAll && <option value="all">All Hubs</option>}
        {!canSelectAll && hubs.length === 0 && <option value="all">No assigned hub</option>}
        {hubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}{hub.active ? '' : ' (Inactive)'}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
    </label>
  );
}
