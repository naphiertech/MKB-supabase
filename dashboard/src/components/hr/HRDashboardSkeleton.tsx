import { SkeletonStatCard, SkeletonTable } from '../common/SkeletonPrimitives';

export function RiderStatusGridSkeleton() {
  return (
    <div className="bg-white border border-border rounded-xl shadow-sm">
      <div className="flex flex-wrap items-center gap-3 justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/25 flex items-center justify-center shrink-0" />
          <div className="space-y-1">
            <div className="w-24 h-3.5 rounded ar-shimmer" />
            <div className="w-16 h-3 rounded ar-shimmer" />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-56 h-8 rounded-md border border-border ar-shimmer opacity-50" />
          <div className="w-32 h-8 rounded-md border border-border ar-shimmer opacity-50" />
        </div>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="relative text-left bg-white border border-border rounded-xl p-3.5 flex flex-col gap-3 overflow-hidden before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-border"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-panel-bg ring-2 ring-border ring-offset-2 ring-offset-white ar-shimmer shrink-0" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="w-20 h-3.5 rounded ar-shimmer" />
                  <div className="w-12 h-2.5 rounded ar-shimmer" />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="w-12 h-4 rounded ar-shimmer" />
                <div className="w-14 h-4 rounded ar-shimmer" />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="w-10 h-3 rounded ar-shimmer" />
                <div className="w-8 h-3.5 rounded ar-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HRViolationSummarySkeleton() {
  return (
    <div className="bg-white border border-border rounded-xl flex flex-col h-full shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-50 ring-1 ring-red-500/25 flex items-center justify-center shrink-0" />
          <div className="space-y-1">
            <div className="w-28 h-3.5 rounded ar-shimmer" />
            <div className="w-20 h-3 rounded ar-shimmer" />
          </div>
        </div>
        <div className="w-16 h-3 rounded ar-shimmer" />
      </div>
      <div className="flex gap-1.5 px-4 py-2 bg-panel-bg/50 border-b border-border shrink-0">
        <div className="w-12 h-5 rounded-md ar-shimmer" />
        <div className="w-24 h-5 rounded-md ar-shimmer" />
        <div className="w-16 h-5 rounded-md ar-shimmer" />
      </div>
      <div className="p-3 space-y-2 flex-1 overflow-hidden">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="flex items-start gap-3 p-3 rounded-lg border border-border bg-panel-bg/50"
          >
            <div className="w-8 h-8 rounded-md ar-shimmer shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="w-24 h-3.5 rounded ar-shimmer" />
              <div className="w-32 h-3 rounded ar-shimmer" />
              <div className="w-16 h-2.5 rounded ar-shimmer" />
            </div>
            <div className="w-12 h-7 rounded-md bg-primary/10 ar-shimmer shrink-0 self-center" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HRDashboardSkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white border border-border rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-panel-bg ar-shimmer shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="w-32 h-3.5 rounded ar-shimmer" />
              <div className="w-20 h-2.5 rounded ar-shimmer" />
            </div>
            <div className="w-4 h-4 ar-shimmer shrink-0" />
          </div>
        ))}
      </div>

      <SkeletonTable rows={6} columns={6} />
      <RiderStatusGridSkeleton />
      <HRViolationSummarySkeleton />
    </div>
  );
}
