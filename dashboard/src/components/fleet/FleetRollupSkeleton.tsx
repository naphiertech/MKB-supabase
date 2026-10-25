export function FleetRollupSkeleton() {
  return (
    <div className="bg-white border border-border rounded-xl shadow-sm">
      <div className="flex items-center gap-2.5 p-3.5 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/25 shrink-0" />
        <div className="space-y-1">
          <div className="w-24 h-3.5 rounded ar-shimmer" />
          <div className="w-28 h-3 rounded ar-shimmer" />
        </div>
      </div>
      <div className="p-3.5 space-y-4">
        <div className="space-y-2">
          <div className="h-2 w-full rounded-full ar-shimmer" />
          <div className="grid grid-cols-2 gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 rounded-md border border-border ar-shimmer" />
            ))}
          </div>
        </div>
        <div className="space-y-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 rounded-md ar-shimmer" />
          ))}
        </div>
      </div>
    </div>
  );
}
