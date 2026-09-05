import { SkeletonBlock, SkeletonPage, SkeletonStatCard, SkeletonTable } from '../common/SkeletonPrimitives';

export function AttendanceSkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Attendance Logs">
      {/* Top Header Controls: Date Range & Action Buttons */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Attendance filter placeholder">
        <div className="flex items-center gap-2 flex-wrap">
          <SkeletonBlock className="h-9 w-36 rounded-lg" />
          <SkeletonBlock className="h-9 w-36 rounded-lg" />
          <div className="hidden md:flex gap-1">
            <SkeletonBlock className="h-8 w-16 rounded-md" />
            <SkeletonBlock className="h-8 w-20 rounded-md" />
            <SkeletonBlock className="h-8 w-24 rounded-md" />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SkeletonBlock className="h-9 w-28 rounded-lg" />
          <SkeletonBlock className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* 4 Attendance KPI Stat Cards */}
      <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* Single Filter Toolbar */}
      <div className="ui-toolbar flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <SkeletonBlock className="h-9 w-44 rounded-lg" />
          <div className="flex gap-1">
            <SkeletonBlock className="h-9 w-20 rounded-lg" />
            <SkeletonBlock className="h-9 w-16 rounded-lg" />
            <SkeletonBlock className="h-9 w-18 rounded-lg" />
          </div>
          <SkeletonBlock className="h-9 w-32 rounded-lg" />
          <SkeletonBlock className="h-9 min-w-[12rem] flex-1 rounded-lg" />
        </div>
      </div>

      {/* Attendance Table: 7 Columns */}
      <SkeletonTable
        rows={4}
        columns={7}
        columnWeights={[0.35, 1.8, 1, 1.2, 0.9, 0.9, 0.85]}
        minWidthClassName="data-table-wide"
        showToolbar={false}
        showFooter={false}
        mobileCards={false}
      />
    </SkeletonPage>
  );
}
