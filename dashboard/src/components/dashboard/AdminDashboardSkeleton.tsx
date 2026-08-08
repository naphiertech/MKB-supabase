import { SkeletonStatCard, SkeletonMap, SkeletonTable } from '../common/SkeletonPrimitives';

export function OnlineRidersSkeleton() {
  return (
    <div className="bg-white border border-border rounded-xl flex flex-col h-full min-h-[400px] lg:h-[512px] shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg ar-shimmer shrink-0" />
          <div className="space-y-1">
            <div className="w-24 h-3.5 rounded ar-shimmer" />
            <div className="w-16 h-3 rounded ar-shimmer" />
          </div>
        </div>
        <div className="w-16 h-8 rounded-md ar-shimmer" />
      </div>
      <div className="p-2 space-y-1.5 flex-1 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-panel-bg border border-transparent"
          >
            <div className="w-9 h-9 rounded-full bg-white ring-2 ring-border ring-offset-2 ring-offset-white ar-shimmer shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="w-24 h-3.5 rounded ar-shimmer" />
              <div className="flex items-center gap-2">
                <div className="w-12 h-3.5 rounded ar-shimmer" />
                <div className="w-10 h-3 rounded ar-shimmer" />
              </div>
            </div>
            <div className="w-4 h-4 rounded ar-shimmer shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ViolationFeedSkeleton() {
  return (
    <div className="bg-white border border-border rounded-xl flex flex-col h-full min-h-[360px] shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg ar-shimmer shrink-0" />
          <div className="space-y-1">
            <div className="w-28 h-3.5 rounded ar-shimmer" />
            <div className="w-20 h-3 rounded ar-shimmer" />
          </div>
        </div>
        <div className="w-20 h-3.5 rounded ar-shimmer" />
      </div>
      <div className="p-3 space-y-2 flex-1 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
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

export function AdminDashboardSkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <SkeletonMap />
        </div>
        <div className="lg:col-span-2">
          <OnlineRidersSkeleton />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <SkeletonTable rows={5} columns={5} />
        </div>
        <div className="lg:col-span-2">
          <ViolationFeedSkeleton />
        </div>
      </div>
    </div>
  );
}
