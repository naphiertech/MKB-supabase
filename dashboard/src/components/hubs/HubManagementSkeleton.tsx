import { SkeletonBlock, SkeletonPage, SkeletonStatCard } from '../common/SkeletonPrimitives';

export function HubManagementSkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Hub Management">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBlock className="h-5 w-36" />
          <SkeletonBlock className="h-3 w-80 max-w-full" />
        </div>
        <SkeletonBlock className="h-11 w-32 rounded-lg" />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <SkeletonStatCard key={index} compact />)}
      </div>

      <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(18rem,0.78fr)_minmax(0,1.35fr)] 2xl:grid-cols-[minmax(22rem,0.72fr)_minmax(0,1.5fr)]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1.5"><SkeletonBlock className="h-3.5 w-20" /><SkeletonBlock className="h-2.5 w-24" /></div>
              <SkeletonBlock className="h-8 w-8 rounded-lg" />
            </div>
            <div className="grid gap-2 lg:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_auto_auto]">
              <SkeletonBlock className="h-10 min-w-0 rounded-lg" />
              <SkeletonBlock className="h-10 w-full rounded-lg 2xl:w-28" />
              <SkeletonBlock className="h-10 w-full rounded-lg 2xl:w-24" />
            </div>
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-4 py-3.5">
                <SkeletonBlock className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-1.5"><SkeletonBlock className="h-3.5 w-32 max-w-full" /><SkeletonBlock className="h-2.5 w-44 max-w-full" /></div>
                <SkeletonBlock className="h-4 w-4 shrink-0" />
              </div>
            ))}
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-border p-4 sm:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <SkeletonBlock className="h-11 w-11 shrink-0 rounded-xl" />
              <div className="min-w-0 space-y-2"><SkeletonBlock className="h-5 w-40 max-w-full" /><SkeletonBlock className="h-2.5 w-52 max-w-full" /></div>
            </div>
            <div className="flex gap-2"><SkeletonBlock className="h-9 w-9 rounded-lg" /><SkeletonBlock className="h-9 w-9 rounded-lg" /></div>
          </div>
          <div className="flex gap-5 overflow-hidden border-b border-border px-4 py-4">
            {[96, 72, 42, 54].map((width) => <SkeletonBlock key={width} className="h-3 shrink-0" style={{ width }} />)}
          </div>
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex items-end justify-between gap-3">
              <div className="space-y-2"><SkeletonBlock className="h-3.5 w-32" /><SkeletonBlock className="h-2.5 w-72 max-w-full" /></div>
              <SkeletonBlock className="h-6 w-24 rounded-full" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex flex-col gap-3 rounded-lg border border-border bg-panel-bg/50 p-3 sm:flex-row sm:items-center">
                  <SkeletonBlock className="h-8 w-8 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-1.5"><SkeletonBlock className="h-3.5 w-48 max-w-full" /><SkeletonBlock className="h-2.5 w-24" /></div>
                  <SkeletonBlock className="h-10 w-full rounded-lg sm:w-48" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </SkeletonPage>
  );
}
