import { SkeletonBlock, SkeletonPage, SkeletonTable } from '../common/SkeletonPrimitives';

export function ParcelRatesSkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Parcel Rates">
      {/* Parcel Rates Toolbar */}
      <div className="ui-toolbar flex flex-col gap-4 p-4 md:p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-4 w-4 rounded" />
            <SkeletonBlock className="h-4 w-44 rounded" />
          </div>
          <SkeletonBlock className="h-3 w-80 max-w-full rounded" />
        </div>
        <SkeletonBlock className="h-10 w-full sm:w-40 rounded-lg shrink-0" />
      </div>

      {/* 8 Rate Summary Cards */}
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="ui-card p-4 space-y-2">
            <SkeletonBlock className="h-2.5 w-24 rounded" />
            <SkeletonBlock className="h-5 w-20 rounded" />
          </div>
        ))}
      </div>

      {/* Historical Protection Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 shadow-xs">
        <SkeletonBlock className="mt-0.5 h-4 w-4 shrink-0 rounded bg-amber-300/60" />
        <SkeletonBlock className="h-3.5 w-full max-w-2xl rounded bg-amber-200/50" />
      </div>

      {/* Configuration History Table */}
      <section className="ui-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <SkeletonBlock className="h-4 w-4 rounded" />
          <SkeletonBlock className="h-4 w-48 rounded" />
        </div>
        <SkeletonTable
          rows={4}
          columns={9}
          columnWeights={[1.6, 0.9, 0.9, 0.9, 1.1, 1.1, 0.9, 1.8, 0.8]}
          minWidthClassName="data-table-wide"
          showToolbar={false}
          showFooter={false}
          mobileCards={false}
        />
      </section>
    </SkeletonPage>
  );
}
