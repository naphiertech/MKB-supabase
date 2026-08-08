import { SkeletonStatCard, SkeletonTable } from '../common/SkeletonPrimitives';

export function PayrollDashboardOverviewSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 bg-white border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="w-44 h-4 rounded ar-shimmer" />
          <div className="w-12 h-3.5 rounded ar-shimmer" />
        </div>
        <div className="relative border-l border-border ml-3 pl-5 space-y-5 py-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="relative group space-y-2">
              <span className="absolute -left-[31px] top-0 flex items-center justify-center w-5 h-5 rounded-full border border-border bg-panel-bg ar-shimmer shrink-0" />
              <div className="w-2/3 h-4 rounded ar-shimmer" />
              <div className="w-1/3 h-3 rounded ar-shimmer" />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-border rounded-xl p-5 shadow-sm space-y-4 h-fit">
        <div className="w-24 h-4 rounded ar-shimmer border-b border-border pb-3" />
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="p-3.5 rounded-xl border border-border flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg ar-shimmer shrink-0" />
              <div className="space-y-2 flex-1 mt-0.5">
                <div className="w-32 h-3.5 rounded ar-shimmer" />
                <div className="w-48 h-3 rounded ar-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PayrollDashboardSkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      <div className="flex items-start gap-2.5 px-4 py-2.5 rounded-lg border border-primary/30 bg-accent ar-shimmer opacity-50">
        <div className="w-4 h-4 rounded ar-shimmer shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1.5">
          <div className="w-32 h-3 rounded ar-shimmer" />
          <div className="w-full h-3 rounded ar-shimmer" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      <div className="bg-white border border-border rounded-xl p-4 sm:p-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg ar-shimmer shrink-0" />
          <div className="space-y-1.5">
            <div className="w-24 h-2.5 rounded ar-shimmer" />
            <div className="w-32 h-3.5 rounded ar-shimmer" />
          </div>
        </div>
        <div className="w-32 h-9 rounded-md ar-shimmer" />
      </div>

      <PayrollDashboardOverviewSkeleton />
    </div>
  );
}

export function SalaryComputationSkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      <div className="bg-white border border-border rounded-xl p-4 sm:p-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg ar-shimmer shrink-0" />
          <div className="space-y-1.5">
            <div className="w-24 h-2.5 rounded ar-shimmer" />
            <div className="w-32 h-3.5 rounded ar-shimmer" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-28 h-9 rounded-md ar-shimmer" />
          <div className="w-20 h-9 rounded-md ar-shimmer" />
          <div className="w-28 h-9 rounded-md ar-shimmer" />
        </div>
      </div>
      <SkeletonTable rows={6} columns={6} />
    </div>
  );
}

export function PayrollReportsSkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white border border-border rounded-xl p-5 space-y-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-lg ar-shimmer shrink-0" />
            <div className="w-24 h-3.5 rounded ar-shimmer" />
            <div className="w-full h-8 rounded ar-shimmer" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white border border-border rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <div className="w-8 h-8 rounded-lg ar-shimmer shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="w-32 h-4 rounded ar-shimmer" />
              <div className="w-24 h-3 rounded ar-shimmer" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="w-12 h-3 rounded ar-shimmer" />
                <div className="w-full h-10 rounded-lg border border-border ar-shimmer opacity-40" />
              </div>
              <div className="space-y-1.5">
                <div className="w-12 h-3 rounded ar-shimmer" />
                <div className="w-full h-10 rounded-lg border border-border ar-shimmer opacity-40" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="w-20 h-3 rounded ar-shimmer" />
              <div className="w-full h-8 rounded ar-shimmer" />
            </div>
            <div className="space-y-1.5">
              <div className="w-24 h-3 rounded ar-shimmer" />
              <div className="w-full h-10 rounded-lg border border-border ar-shimmer opacity-40" />
            </div>
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-5 shadow-sm space-y-4 h-fit">
          <div className="w-24 h-4 rounded ar-shimmer border-b border-border pb-3" />
          <div className="space-y-3">
            <div className="w-full h-12 rounded-lg ar-shimmer" />
            <div className="w-full h-12 rounded-lg ar-shimmer" />
            <div className="w-full h-12 rounded-lg ar-shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function PayrollChecklistSkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      <div className="flex items-start gap-2.5 px-4 py-2.5 rounded-lg border border-primary/30 bg-accent ar-shimmer opacity-50">
        <div className="w-4 h-4 rounded ar-shimmer shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1.5">
          <div className="w-32 h-3 rounded ar-shimmer" />
          <div className="w-full h-3 rounded ar-shimmer" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      <div className="bg-white border border-border rounded-xl p-4 sm:p-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg ar-shimmer shrink-0" />
          <div className="space-y-1.5">
            <div className="w-24 h-2.5 rounded ar-shimmer" />
            <div className="w-32 h-3.5 rounded ar-shimmer" />
          </div>
        </div>
        <div className="w-32 h-9 rounded-md ar-shimmer" />
      </div>

      <SkeletonTable rows={5} columns={6} />
    </div>
  );
}

export function DailyParcelEntrySkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>
      <div className="bg-white border border-border rounded-xl p-5 space-y-4 shadow-sm">
        <div className="w-40 h-4.5 rounded ar-shimmer" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="h-10 rounded-lg border border-border ar-shimmer opacity-40" />
          <div className="h-10 rounded-lg border border-border ar-shimmer opacity-40" />
          <div className="h-10 rounded-lg border border-border ar-shimmer opacity-40" />
        </div>
      </div>
      <SkeletonTable rows={5} columns={6} />
    </div>
  );
}

export function ParcelHistorySkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>
      <div className="bg-white border border-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="w-56 h-9 rounded-lg border border-border ar-shimmer opacity-40" />
        <div className="w-36 h-9 rounded-lg border border-border ar-shimmer opacity-40" />
      </div>
      <SkeletonTable rows={6} columns={6} />
    </div>
  );
}

export function PayrollHistorySkeleton() {
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      <div className="bg-white border border-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="w-48 h-9 rounded-lg border border-border ar-shimmer opacity-40" />
        <div className="w-32 h-9 rounded-lg border border-border ar-shimmer opacity-40" />
      </div>
      <SkeletonTable rows={6} columns={6} />
    </div>
  );
}
