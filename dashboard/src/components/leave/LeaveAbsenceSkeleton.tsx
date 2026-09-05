import { SkeletonBlock, SkeletonPage, SkeletonStatCard, SkeletonTable } from '../common/SkeletonPrimitives';

export function LeaveAbsenceSkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Leave & Absence">
      {/* 3 Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SkeletonStatCard compact />
        <SkeletonStatCard compact />
        <SkeletonStatCard compact />
      </div>

      {/* Main Review Section */}
      <div className="space-y-4 rounded-xl border border-border bg-white p-4 sm:p-5 shadow-sm">
        {/* Header with Title and Badges */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5">
            <SkeletonBlock className="h-3 w-28 rounded" />
            <SkeletonBlock className="h-5 w-48 rounded" />
            <SkeletonBlock className="h-3.5 w-72 sm:w-96 max-w-full rounded" />
          </div>
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-6 w-20 rounded-full" />
            <SkeletonBlock className="h-4 w-24 rounded" />
          </div>
        </div>

        {/* Informational Range Banner */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2">
          <SkeletonBlock className="h-3.5 w-48 rounded" />
          <SkeletonBlock className="h-3.5 w-28 rounded" />
        </div>

        {/* Search and Filters Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SkeletonBlock className="h-9 w-full rounded-lg" />
          <SkeletonBlock className="h-9 w-full rounded-lg" />
          <SkeletonBlock className="h-9 w-full rounded-lg" />
          <SkeletonBlock className="h-9 w-full rounded-lg" />
        </div>

        {/* Requests Table */}
        <SkeletonTable
          rows={4}
          columns={6}
          columnWeights={[1.5, 1, 1.2, 1.5, 0.8, 1]}
          showToolbar={false}
          showFooter={false}
        />
      </div>
    </SkeletonPage>
  );
}
