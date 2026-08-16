import { SkeletonBlock, SkeletonPage, SkeletonStatCard, SkeletonTable } from '../common/SkeletonPrimitives';

export function RiderAssignmentsSkeleton() {
  return (
    <SkeletonPage className="space-y-4" label="Loading Rider Assignments">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <SkeletonStatCard key={index} compact />)}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-border bg-panel-bg/40 px-4 py-2">
          <SkeletonBlock className="h-3.5 w-3.5 shrink-0" />
          <SkeletonBlock className="h-2.5 w-72 max-w-full" />
        </div>
        <div className="grid gap-2 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-[minmax(13rem,1.3fr)_repeat(4,minmax(9rem,1fr))]">
          <SkeletonBlock className="h-10 rounded-lg" />
          {Array.from({ length: 4 }).map((_, index) => <SkeletonBlock key={index} className="h-10 rounded-lg" />)}
        </div>

        <SkeletonTable
          rows={7}
          columns={9}
          columnWeights={[1.45, 1.15, 1.2, 1.55, 1.2, 0.9, 0.9, 0.8, 0.35]}
          className="rounded-none border-0 shadow-none"
          minWidthClassName="min-w-[86rem]"
          showToolbar={false}
          showFooter
          mobileCards
          mobileBreakpoint="lg"
        />
      </section>
    </SkeletonPage>
  );
}
