import { SkeletonPage, SkeletonStatCard, SkeletonTable } from '../common/SkeletonPrimitives';

export function RiderStatusGridSkeleton() {
  return (
    <div className="bg-white border border-border rounded-xl shadow-sm flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 justify-between p-3.5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/25 flex items-center justify-center shrink-0" />
          <div className="space-y-1">
            <div className="w-24 h-3.5 rounded ar-shimmer" />
            <div className="w-16 h-3 rounded ar-shimmer" />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-44 h-8 rounded-md border border-border ar-shimmer opacity-50" />
          <div className="w-32 h-8 rounded-md border border-border ar-shimmer opacity-50" />
        </div>
      </div>
      <div className="p-3.5 max-h-[460px] overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-1 2xl:grid-cols-2 gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="relative text-left bg-white border border-border rounded-xl p-3 flex flex-col gap-2.5 overflow-hidden before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-border"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-panel-bg ring-2 ring-border ring-offset-1 ring-offset-white ar-shimmer shrink-0" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="w-20 h-3.5 rounded ar-shimmer" />
                  <div className="w-12 h-2.5 rounded ar-shimmer" />
                </div>
              </div>
              <div className="flex items-center justify-between gap-1.5">
                <div className="w-14 h-3.5 rounded ar-shimmer" />
                <div className="w-12 h-3.5 rounded ar-shimmer" />
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
    <SkeletonPage className="space-y-5" label="Loading HR Dashboard">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      <div className="bg-[#FFF8F0] border border-[#FFE8D1] rounded-xl p-4 space-y-3">
        <div className="w-36 h-4 rounded ar-shimmer" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-border rounded-lg p-3 h-16 ar-shimmer" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 xl:col-span-8 space-y-5">
          <SkeletonTable rows={6} columns={6} />
        </div>
        <div className="lg:col-span-5 xl:col-span-4 space-y-5">
          <RiderStatusGridSkeleton />
          <HRViolationSummarySkeleton />
          <div className="space-y-2">
            <div className="w-32 h-3 rounded ar-shimmer" />
            <div className="space-y-2.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white border border-border rounded-xl p-3 h-14 ar-shimmer" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}
