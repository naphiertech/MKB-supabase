import { SkeletonBlock, SkeletonPage, SkeletonStatCard } from '../common/SkeletonPrimitives';

export function ChartsGridSkeleton() {
  return (
    <div className="space-y-4" data-reports-panels-skeleton>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="space-y-4 rounded-xl border border-border bg-white p-4 shadow-sm sm:p-5">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <SkeletonBlock className="h-4 w-40" />
                <SkeletonBlock className="h-3 w-56 max-w-full" />
              </div>
              <SkeletonBlock className="h-7 w-20 rounded-lg" />
            </div>
            <SkeletonBlock className="h-[260px] rounded-lg opacity-50 sm:h-[300px]" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 rounded-xl border border-border bg-white p-4 shadow-sm lg:col-span-2 sm:p-5">
          <div className="space-y-1"><SkeletonBlock className="h-4 w-36" /><SkeletonBlock className="h-3 w-48 max-w-full" /></div>
          <SkeletonBlock className="h-[240px] rounded-lg opacity-50" />
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-white p-4 shadow-sm sm:p-5">
          <div className="space-y-1"><SkeletonBlock className="h-4 w-28" /><SkeletonBlock className="h-3 w-40 max-w-full" /></div>
          <SkeletonBlock className="h-[240px] rounded-lg opacity-50" />
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3"><SkeletonBlock className="h-4 w-40" /><SkeletonBlock className="h-6 w-28 rounded-full" /></div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <SkeletonBlock key={index} className="h-24 rounded-lg" />)}
        </div>
      </div>
    </div>
  );
}

export function ReportsSkeleton() {
  return (
    <SkeletonPage className="space-y-4" label="Loading Insights and Reports">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <SkeletonStatCard key={index} compact />)}
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm lg:flex-row lg:items-end">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <SkeletonBlock key={index} className="h-10 rounded-lg" />)}
        </div>
        <SkeletonBlock className="h-9 w-full rounded-lg lg:w-32" />
      </div>
      <ChartsGridSkeleton />
    </SkeletonPage>
  );
}
