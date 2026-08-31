import { ChevronDown, Globe2, X } from 'lucide-react';
import { useHub } from '../../context/HubContext';

export function HubSelector() {
  const { hubs, selectedHubId, canSelectAll, isReady, selectHub } = useHub();
  const isLoading = !isReady;
  const isUnavailable = isReady && ((canSelectAll && hubs.length === 0) || (!canSelectAll && hubs.length <= 1));
  const disabled = isLoading || isUnavailable;
  const showClear = Boolean(canSelectAll && selectedHubId !== null && isReady);

  const cursorClass = isLoading
    ? 'cursor-wait'
    : isUnavailable
      ? 'cursor-not-allowed'
      : 'cursor-pointer';

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1">
      <label className={`relative flex min-h-11 min-w-0 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-white px-2 py-2 text-xs font-semibold text-foreground shadow-sm sm:gap-2 sm:px-2.5 ${cursorClass}`}>
        <Globe2 className="hidden h-4 w-4 shrink-0 text-primary min-[420px]:block" aria-hidden="true" />
        <span className="sr-only">Hub workspace</span>
        <select
          aria-label="Hub workspace"
          value={selectedHubId ?? 'all'}
          disabled={disabled}
          onChange={(event) => selectHub(event.target.value === 'all' ? null : event.target.value)}
          className={`min-w-0 max-w-[5.5rem] appearance-none truncate bg-transparent pr-5 outline-none disabled:bg-transparent sm:max-w-[8rem] xl:max-w-[10rem] 2xl:max-w-[14rem] ${cursorClass}`}
        >
          {canSelectAll && <option value="all">All Hubs</option>}
          {!canSelectAll && hubs.length === 0 && <option value="all">No assigned hub</option>}
          {hubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}{hub.active ? '' : ' (Inactive)'}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </label>
      {showClear && (
        <button
          type="button"
          onClick={() => selectHub(null)}
          aria-label="Show all hubs"
          title="Show all hubs"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 cursor-pointer"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
