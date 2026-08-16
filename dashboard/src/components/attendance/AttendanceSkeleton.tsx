import { SkeletonPage, SkeletonStatCard, SkeletonTable } from '../common/SkeletonPrimitives';

export function AttendanceSkeleton() {
  return (
    <SkeletonPage className="space-y-5" label="Loading Attendance Logs">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      <div className="bg-white border border-border rounded-xl p-4 flex flex-wrap items-end gap-3 shadow-sm">
        <div className="w-32 h-8 rounded ar-shimmer" />
        <div className="w-24 h-8 rounded ar-shimmer" />
      </div>

      <SkeletonTable rows={5} columns={5} />
    </SkeletonPage>
  );
}
